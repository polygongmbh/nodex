import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKUser,
  NDKRelay,
  NDKFilter,
  NDKSubscription,
} from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "../types";
import {
  buildKind0Content,
  hasRequiredProfileFields,
  mergeKind0Profiles,
  type EditableNostrProfile,
} from "../profile-metadata";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { buildDeterministicGuestName } from "@/lib/guest-name";
import { getConfiguredDefaultRelays, getConfiguredDefaultRelaysWithFallback } from "@/lib/nostr/default-relays";
import { isRelayUrl } from "@/lib/nostr/relay-url";
import { nostrDevLog } from "../dev-logs";
import type { AuthMethod, NDKContextValue, NDKProviderProps, NDKRelayStatus, NostrUser } from "./contracts";
import {
  hasNostrExtension,
  loadPersistedRelayUrls,
  savePersistedRelayUrls,
  STORAGE_KEY_AUTH,
  STORAGE_KEY_NIP46_BUNKER,
  STORAGE_KEY_NIP46_LOCAL_NSEC,
  STORAGE_KEY_NSEC,
} from "./storage";
import {
  mapNativeRelayStatus,
  MAX_INITIAL_CONNECT_FAILURES,
  RELAY_STATUS_RECONCILE_INTERVAL_MS,
  resolveRelayLifecycleStatus,
} from "./relay-status";
import {
  appendResolvedRelayUrl,
  mergeConfiguredRelayStatuses,
  normalizeRelayUrl,
  removeResolvedRelayUrl,
} from "./relay-list";
import { waitForNostrExtensionAvailability } from "./session-restore";
import { resolveVerifiedNip05RelayUrls, verifyNip05 } from "../nip05-verify";
import { createRelayNip42AuthPolicy, type RelayVerificationEvent } from "../nip42-relay-auth-policy";
import { createNip98AuthHeader } from "../nip98-http-auth";
import {
  isAuthRequiredCloseReason,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldRetryNip42AfterSignIn,
  shouldRetryAuthAfterReadRejection,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import {
  extractRelayRejectionReason,
} from "./relay-error";
import { fetchRelayInfo, type RelayInfoSummary } from "../relay-info";
import { extractRelayUrlsFromNip65Tags, selectComplementaryRelayUrls } from "../relay-enrichment";
import i18n from "@/lib/i18n/config";
import { toast } from "sonner";
export type { AuthMethod, NostrUser, NDKRelayStatus, NDKContextValue } from "./contracts";

const NDKContext = createContext<NDKContextValue | null>(null);
const RELAY_VERIFICATION_TOAST_DEDUPE_MS = 15000;
const RELAY_PUBLISH_TIMEOUT_MS = 3000;
const RELAY_RESUME_RECONNECT_COOLDOWN_MS = 5000;
type RelayOperation = "read" | "write" | "unknown";

export function NDKProvider({ children, defaultRelays }: NDKProviderProps) {
  const persistedRelayUrls = useMemo(() => loadPersistedRelayUrls(), []);
  const configuredDefaultRelays = useMemo(
    () => defaultRelays || getConfiguredDefaultRelays(),
    [defaultRelays]
  );
  const [resolvedDefaultRelays, setResolvedDefaultRelays] = useState<string[]>(
    () => {
      if (persistedRelayUrls && persistedRelayUrls.length > 0) return persistedRelayUrls;
      if (configuredDefaultRelays.length > 0) return configuredDefaultRelays;
      return [];
    }
  );
  const [isResolvingDefaultRelays, setIsResolvingDefaultRelays] = useState(
    () => (!persistedRelayUrls || persistedRelayUrls.length === 0) && configuredDefaultRelays.length === 0
  );
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NostrUser | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [relays, setRelays] = useState<NDKRelayStatus[]>([]);
  const removedRelaysRef = useRef<Set<string>>(new Set());
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const profileSyncRunRef = useRef(0);
  const relayInitialFailureCountsRef = useRef<Map<string, number>>(new Map());
  const relayConnectedOnceRef = useRef<Set<string>>(new Set());
  const relayAutoPausedRef = useRef<Set<string>>(new Set());
  const relayVerificationReadOpsRef = useRef(0);
  const relayVerificationWriteOpsRef = useRef(0);
  const relayVerificationToastHistoryRef = useRef<Map<string, number>>(new Map());
  const pendingRelayVerificationRef = useRef<Map<string, { operation: RelayOperation; requestedAt: number }>>(new Map());
  const relayAuthRetryHistoryRef = useRef<Map<string, number>>(new Map());
  const relayInfoRef = useRef<Map<string, RelayInfoSummary>>(new Map());
  const relayReadRejectedRef = useRef<Map<string, boolean>>(new Map());
  const relayWriteRejectedRef = useRef<Map<string, boolean>>(new Map());
  const relayAttemptStartedAtRef = useRef<Map<string, number>>(new Map());
  const relayAuthRetrySessionKeyRef = useRef<string | null>(null);
  const relayAuthRetriedUrlsForSessionRef = useRef<Set<string>>(new Set());
  const complementaryRelaySyncKeyRef = useRef<string | null>(null);
  const lastResumeReconnectAtRef = useRef(0);

  const resetRelayConnectionTracking = useCallback((normalizedRelayUrl: string) => {
    removedRelaysRef.current.delete(normalizedRelayUrl);
    relayInitialFailureCountsRef.current.delete(normalizedRelayUrl);
    relayConnectedOnceRef.current.delete(normalizedRelayUrl);
    relayAutoPausedRef.current.delete(normalizedRelayUrl);
    relayReadRejectedRef.current.delete(normalizedRelayUrl);
    relayWriteRejectedRef.current.delete(normalizedRelayUrl);
    pendingRelayVerificationRef.current.delete(normalizedRelayUrl);
    relayAuthRetryHistoryRef.current.delete(normalizedRelayUrl);
    relayAttemptStartedAtRef.current.set(normalizedRelayUrl, Date.now());
  }, []);

  useEffect(() => {
    if (resolvedDefaultRelays.length === 0) return;
    setRelays((previous) =>
      mergeConfiguredRelayStatuses({
        relays: previous,
        configuredRelayUrls: resolvedDefaultRelays,
        removedRelayUrls: removedRelaysRef.current,
        relayInfoByUrl: relayInfoRef.current,
      })
    );
  }, [resolvedDefaultRelays]);

  useEffect(() => {
    if (persistedRelayUrls && persistedRelayUrls.length > 0) {
      setResolvedDefaultRelays(persistedRelayUrls);
      setIsResolvingDefaultRelays(false);
      return;
    }

    if (configuredDefaultRelays.length > 0) {
      setResolvedDefaultRelays(configuredDefaultRelays);
      setIsResolvingDefaultRelays(false);
      return;
    }

    let cancelled = false;
    setIsResolvingDefaultRelays(true);
    void (async () => {
      const discoveredRelayUrls = await getConfiguredDefaultRelaysWithFallback();
      if (cancelled) return;
      setResolvedDefaultRelays(discoveredRelayUrls);
      setIsResolvingDefaultRelays(false);
      if (discoveredRelayUrls.length > 0) {
        savePersistedRelayUrls(discoveredRelayUrls);
        nostrDevLog("relay", "Resolved default relays from current host", {
          hostname: window.location.hostname,
          relayUrls: discoveredRelayUrls,
        });
        return;
      }
      console.warn("No default relays configured and no host-derived relay was reachable");
    })();

    return () => {
      cancelled = true;
    };
  }, [configuredDefaultRelays, persistedRelayUrls]);

  const resolveRelayVerificationOperation = useCallback((): RelayOperation => {
    const hasRead = relayVerificationReadOpsRef.current > 0;
    const hasWrite = relayVerificationWriteOpsRef.current > 0;
    if (hasRead && hasWrite) return "unknown";
    if (hasWrite) return "write";
    if (hasRead) return "read";
    return "unknown";
  }, []);

  const beginRelayOperation = useCallback((operation: Exclude<RelayOperation, "unknown">) => {
    if (operation === "read") {
      relayVerificationReadOpsRef.current += 1;
      return;
    }
    relayVerificationWriteOpsRef.current += 1;
  }, []);

  const endRelayOperation = useCallback((operation: Exclude<RelayOperation, "unknown">) => {
    if (operation === "read") {
      relayVerificationReadOpsRef.current = Math.max(0, relayVerificationReadOpsRef.current - 1);
      return;
    }
    relayVerificationWriteOpsRef.current = Math.max(0, relayVerificationWriteOpsRef.current - 1);
  }, []);

  const resolveConnectedRelayStatus = useCallback((normalizedRelayUrl: string): NDKRelayStatus["status"] => {
    if (relayReadRejectedRef.current.get(normalizedRelayUrl)) return "verification-failed";
    if (relayWriteRejectedRef.current.get(normalizedRelayUrl)) return "read-only";
    return "connected";
  }, []);

  const markRelayReadOutcome = useCallback((relayUrl: string, allowed: boolean) => {
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    if (allowed) {
      relayReadRejectedRef.current.delete(normalizedRelayUrl);
    } else {
      relayReadRejectedRef.current.set(normalizedRelayUrl, true);
    }
    setRelays((previous) =>
      previous.map((relay) => {
        if (relay.url.replace(/\/+$/, "") !== normalizedRelayUrl) return relay;
        if (relay.status === "connection-error" || relay.status === "disconnected" || relay.status === "connecting") {
          return relay;
        }
        return {
          ...relay,
          status: resolveConnectedRelayStatus(normalizedRelayUrl),
        };
      })
    );
  }, [resolveConnectedRelayStatus]);

  const markRelayWriteOutcome = useCallback((relayUrl: string, allowed: boolean) => {
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    if (allowed) {
      relayWriteRejectedRef.current.delete(normalizedRelayUrl);
    } else {
      relayWriteRejectedRef.current.set(normalizedRelayUrl, true);
    }
    setRelays((previous) =>
      previous.map((relay) => {
        if (relay.url.replace(/\/+$/, "") !== normalizedRelayUrl) return relay;
        if (relay.status === "connection-error" || relay.status === "disconnected" || relay.status === "connecting") {
          return relay;
        }
        return {
          ...relay,
          status: resolveConnectedRelayStatus(normalizedRelayUrl),
        };
      })
    );
  }, [resolveConnectedRelayStatus]);

  const shouldShowRelayVerificationToast = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    outcome: RelayVerificationEvent["outcome"] | "verified"
  ): boolean => {
    const now = Date.now();
    const key = `${relayUrl}|${operation}|${outcome}`;
    const previousShownAt = relayVerificationToastHistoryRef.current.get(key) ?? 0;
    if (now - previousShownAt < RELAY_VERIFICATION_TOAST_DEDUPE_MS) {
      return false;
    }
    relayVerificationToastHistoryRef.current.set(key, now);
    return true;
  }, []);

  const markRelayVerificationSuccess = useCallback((relayUrl: string, operation: RelayOperation) => {
    if (operation === "read") {
      markRelayReadOutcome(relayUrl, true);
    } else if (operation === "write") {
      markRelayWriteOutcome(relayUrl, true);
    } else {
      markRelayReadOutcome(relayUrl, true);
      markRelayWriteOutcome(relayUrl, true);
    }
    if (!shouldShowRelayVerificationToast(relayUrl, operation, "verified")) {
      return;
    }
    if (operation === "read") {
      toast.success(i18n.t("toasts.success.relayVerificationRead", { relayUrl }));
      return;
    }
    if (operation === "write") {
      toast.success(i18n.t("toasts.success.relayVerificationWrite", { relayUrl }));
      return;
    }
    toast.success(i18n.t("toasts.success.relayVerificationUnknown", { relayUrl }));
  }, [markRelayReadOutcome, markRelayWriteOutcome, shouldShowRelayVerificationToast]);

  const markRelayVerificationFailure = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    options?: { setStatus?: boolean; showToast?: boolean }
  ) => {
    const shouldSetStatus = options?.setStatus ?? false;
    const shouldShowToast = options?.showToast ?? true;
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    pendingRelayVerificationRef.current.delete(normalizedRelayUrl);
    if (shouldSetStatus) {
      if (operation === "read") {
        markRelayReadOutcome(relayUrl, false);
      } else if (operation === "write") {
        markRelayWriteOutcome(relayUrl, false);
      } else {
        markRelayReadOutcome(relayUrl, false);
        markRelayWriteOutcome(relayUrl, false);
      }
    }
    if (!shouldShowToast || !shouldShowRelayVerificationToast(relayUrl, operation, "failed")) {
      return;
    }
    if (operation === "read") {
      toast.error(i18n.t("toasts.errors.relayVerificationReadFailed", { relayUrl }));
    } else if (operation === "write") {
      toast.error(i18n.t("toasts.errors.relayVerificationWriteFailed", { relayUrl }));
    } else {
      toast.error(i18n.t("toasts.errors.relayVerificationUnknownFailed", { relayUrl }));
    }
  }, [markRelayReadOutcome, markRelayWriteOutcome, shouldShowRelayVerificationToast]);

  const notifyRelayVerificationEvent = useCallback((incoming: RelayVerificationEvent) => {
    const operation = incoming.operation === "unknown"
      ? resolveRelayVerificationOperation()
      : incoming.operation;
    const event = { ...incoming, operation };

    nostrDevLog("relay", "Relay verification event", event);

    if (event.outcome === "required") {
      pendingRelayVerificationRef.current.set(event.relayUrl.replace(/\/+$/, ""), {
        operation: event.operation,
        requestedAt: Date.now(),
      });
      return;
    }
    if (event.outcome === "failed") {
      markRelayVerificationFailure(event.relayUrl, event.operation, {
        setStatus: shouldSetVerificationFailedStatus("auth-policy", event.operation),
        showToast: false,
      });
    }
  }, [markRelayVerificationFailure, resolveRelayVerificationOperation]);

  const probeRelayInfo = useCallback(async (relayUrl: string) => {
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    const info = await fetchRelayInfo(normalizedRelayUrl);
    if (!info) {
      nostrDevLog("relay", "Relay NIP-11 info unavailable", {
        relayUrl: normalizedRelayUrl,
      });
      return;
    }
    relayInfoRef.current.set(normalizedRelayUrl, info);
    setRelays((previous) =>
      previous.map((relay) =>
        relay.url.replace(/\/+$/, "") === normalizedRelayUrl
          ? {
              ...relay,
              nip11: {
                authRequired: info.authRequired,
                supportsNip42: info.supportsNip42,
                checkedAt: Date.now(),
              },
            }
          : relay
      )
    );
    nostrDevLog("relay", "Relay NIP-11 info loaded", {
      relayUrl: normalizedRelayUrl,
      authRequired: info.authRequired,
      supportsNip42: info.supportsNip42,
    });
  }, []);

  const retryNip42RelaysAfterSignIn = useCallback((relayUrlsOverride?: string[]) => {
    if (!ndk) return;
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "");
    const relayUrlsToRetry = relayUrlsOverride
      ? relayUrlsOverride.map(normalizeUrl).filter(Boolean)
      : relays
          .filter((relay) => shouldRetryNip42AfterSignIn(relay))
          .map((relay) => normalizeUrl(relay.url));

    if (relayUrlsToRetry.length === 0) return;

    const retrySet = new Set(relayUrlsToRetry);
    nostrDevLog("relay", "Retrying NIP-42 auth-capable relays after sign in", {
      relayUrls: relayUrlsToRetry,
    });

    relayUrlsToRetry.forEach((relayUrl) => {
      resetRelayConnectionTracking(relayUrl);
    });
    setRelays((previous) =>
      previous.map((relay) =>
        retrySet.has(normalizeUrl(relay.url))
          ? { ...relay, status: "connecting" }
          : relay
      )
    );

    relayUrlsToRetry.forEach((relayUrl) => {
      const relay = ndk.pool.getRelay(relayUrl, true);
      relay?.disconnect();
      relay?.connect();
    });
  }, [ndk, relays, resetRelayConnectionTracking]);

  useEffect(() => {
    const sessionKey = user?.pubkey && authMethod ? `${authMethod}:${user.pubkey}` : null;
    if (!sessionKey || !ndk?.signer) {
      relayAuthRetrySessionKeyRef.current = sessionKey;
      relayAuthRetriedUrlsForSessionRef.current.clear();
      return;
    }

    if (relayAuthRetrySessionKeyRef.current !== sessionKey) {
      relayAuthRetrySessionKeyRef.current = sessionKey;
      relayAuthRetriedUrlsForSessionRef.current.clear();
    }

    const relayUrlsToRetry = relays
      .filter((relay) => shouldRetryNip42AfterSignIn(relay))
      .map((relay) => relay.url.replace(/\/+$/, ""))
      .filter((relayUrl) => !relayAuthRetriedUrlsForSessionRef.current.has(relayUrl));

    if (relayUrlsToRetry.length === 0) return;

    relayUrlsToRetry.forEach((relayUrl) => {
      relayAuthRetriedUrlsForSessionRef.current.add(relayUrl);
    });
    retryNip42RelaysAfterSignIn(relayUrlsToRetry);
  }, [authMethod, ndk, relays, retryNip42RelaysAfterSignIn, user?.pubkey]);

  const fetchLatestKind0Profile = useCallback(async (pubkey: string): Promise<NostrUser["profile"] | null> => {
    if (!ndk) return null;

    return await new Promise((resolve) => {
      const candidates: { createdAt: number; content: string }[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        endRelayOperation("read");
        subscription.stop();
        if (candidates.length === 0) {
          resolve(null);
          return;
        }
        const parsed = mergeKind0Profiles(candidates);
        resolve({
          name: parsed.name,
          displayName: parsed.displayName,
          picture: parsed.picture,
          about: parsed.about,
          nip05: parsed.nip05,
        });
      };

      beginRelayOperation("read");
      const subscription = ndk.subscribe(
        [{ kinds: [NostrEventKind.Metadata as number], authors: [pubkey] }],
        { closeOnEose: true }
      );

      subscription.on("event", (event: NDKEvent) => {
        if (event.content) {
          candidates.push({ createdAt: event.created_at || 0, content: event.content });
        }
      });
      subscription.on("eose", finish);

      // Fallback so the UI does not hang if eose never arrives.
      setTimeout(finish, 12000);
    });
  }, [beginRelayOperation, endRelayOperation, ndk]);

  const fetchLatestNip65RelayUrls = useCallback(async (pubkey: string): Promise<string[]> => {
    if (!ndk) return [];

    return await new Promise((resolve) => {
      const candidates: { createdAt: number; tags: string[][] }[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        endRelayOperation("read");
        subscription.stop();
        if (candidates.length === 0) {
          resolve([]);
          return;
        }
        candidates.sort((a, b) => b.createdAt - a.createdAt);
        resolve(extractRelayUrlsFromNip65Tags(candidates[0].tags));
      };

      beginRelayOperation("read");
      const subscription = ndk.subscribe(
        [{ kinds: [10002], authors: [pubkey], limit: 1 }],
        { closeOnEose: true }
      );

      subscription.on("event", (event: NDKEvent) => {
        if (Array.isArray(event.tags)) {
          candidates.push({ createdAt: event.created_at || 0, tags: event.tags as string[][] });
        }
      });
      subscription.on("eose", finish);

      // Fallback so the UI does not hang if eose never arrives.
      setTimeout(finish, 6000);
    });
  }, [beginRelayOperation, endRelayOperation, ndk]);

  const userProfileSnapshot = useMemo<NostrUser["profile"] | null>(() => {
    if (!user?.profile) return null;
    return {
      name: user.profile.name,
      displayName: user.profile.displayName,
      picture: user.profile.picture,
      about: user.profile.about,
      nip05: user.profile.nip05,
      nip05Verified: user.profile.nip05Verified,
    };
  }, [
    user?.profile,
  ]);

  // Initialize NDK
  useEffect(() => {
    if (isResolvingDefaultRelays) return;

    let disposed = false;
    nostrDevLog("provider", "Initializing NDK provider", {
      configuredDefaultRelays: resolvedDefaultRelays,
    });
    const ndkInstance = new NDK({
      explicitRelayUrls: resolvedDefaultRelays,
    });

    ndkInstance.relayAuthDefaultPolicy = createRelayNip42AuthPolicy(ndkInstance, notifyRelayVerificationEvent);

    // Set up relay event handlers
    const syncRelayStatusesFromPool = () => {
      const now = Date.now();
      setRelays((prev) => {
        const nextByUrl = new Map(prev.map((entry) => [normalizeRelayUrl(entry.url), entry]));
        ndkInstance.pool.relays.forEach((relay: NDKRelay) => {
          const normalized = normalizeRelayUrl(relay.url);
          if (removedRelaysRef.current.has(normalized)) return;
          const previousEntry = nextByUrl.get(normalized);
          const mappedStatus = mapNativeRelayStatus(relay.status);
          nextByUrl.set(normalized, {
            ...previousEntry,
            url: normalized,
            status: mappedStatus === "connected"
              ? resolveConnectedRelayStatus(normalized)
              : resolveRelayLifecycleStatus({
                  mappedStatus,
                  previousStatus: previousEntry?.status,
                  hasConnectedOnce: relayConnectedOnceRef.current.has(normalized),
                  isAutoPaused: relayAutoPausedRef.current.has(normalized),
                  attemptStartedAt: relayAttemptStartedAtRef.current.get(normalized),
                  now,
                }),
          });
        });
        return Array.from(nextByUrl.values());
      });
    };

    ndkInstance.pool.on("relay:connecting", () => {
      syncRelayStatusesFromPool();
    });

    ndkInstance.pool.on("relay:connect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      nostrDevLog("relay", "Relay connected", { relayUrl: normalized });
      relayConnectedOnceRef.current.add(normalized);
      relayInitialFailureCountsRef.current.delete(normalized);
      relayAutoPausedRef.current.delete(normalized);
      relayAttemptStartedAtRef.current.delete(normalized);
      const pendingVerification = pendingRelayVerificationRef.current.get(normalized);
      if (pendingVerification) {
        pendingRelayVerificationRef.current.delete(normalized);
        markRelayVerificationSuccess(normalized, pendingVerification.operation);
      }
      if (removedRelaysRef.current.has(normalized)) return;
      setRelays((prev) => {
        const existing = prev.find((r) => normalizeRelayUrl(r.url) === normalized);
        if (existing) {
          return prev.map((r) =>
            normalizeRelayUrl(r.url) === normalized
              ? {
                  ...r,
                  url: normalized,
                  status: resolveConnectedRelayStatus(normalized),
                }
              : r
          );
        }
        const info = relayInfoRef.current.get(normalized);
        const next = [...prev, {
          url: normalized,
          status: resolveConnectedRelayStatus(normalized),
          nip11: info
            ? {
                authRequired: info.authRequired,
                supportsNip42: info.supportsNip42,
                checkedAt: Date.now(),
              }
            : undefined,
        }];
        savePersistedRelayUrls(next.map((entry) => entry.url));
        return next;
      });
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      nostrDevLog("relay", "Relay disconnected", { relayUrl: normalized });
      if (!removedRelaysRef.current.has(normalized)) {
        const now = Date.now();
        setRelays((prev) =>
          prev.map((r) =>
            normalizeRelayUrl(r.url) === normalized
              ? {
                  ...r,
                  status: resolveRelayLifecycleStatus({
                    mappedStatus: "disconnected",
                    previousStatus: r.status,
                    hasConnectedOnce: relayConnectedOnceRef.current.has(normalized),
                    isAutoPaused: relayAutoPausedRef.current.has(normalized),
                    attemptStartedAt: relayAttemptStartedAtRef.current.get(normalized),
                    now,
                  }),
                }
              : r
          )
        );
      }

      if (relayConnectedOnceRef.current.has(normalized)) return;
      if (relayAutoPausedRef.current.has(normalized)) return;

      const nextFailureCount = (relayInitialFailureCountsRef.current.get(normalized) ?? 0) + 1;
      relayInitialFailureCountsRef.current.set(normalized, nextFailureCount);

      if (nextFailureCount < MAX_INITIAL_CONNECT_FAILURES) return;

      relayAutoPausedRef.current.add(normalized);
      relayAttemptStartedAtRef.current.delete(normalized);
      setRelays((prev) =>
        prev.map((entry) =>
          normalizeRelayUrl(entry.url) === normalized ? { ...entry, status: "connection-error" } : entry
        )
      );
      console.warn("Relay auto-paused after repeated failed connection attempts", {
        relayUrl: normalized,
        failures: nextFailureCount,
      });

      relay.disconnect();
      ndkInstance.pool.removeRelay(relay.url);
    });

    // Initialize relay states
    removedRelaysRef.current.clear();
    resolvedDefaultRelays.forEach((relayUrl) => {
      relayAttemptStartedAtRef.current.set(relayUrl.replace(/\/+$/, ""), Date.now());
    });
    setRelays(resolvedDefaultRelays.map((url) => {
      const normalizedUrl = normalizeRelayUrl(url);
      const info = relayInfoRef.current.get(normalizedUrl);
      return {
        url,
        status: "connecting",
        nip11: info
          ? {
              authRequired: info.authRequired,
              supportsNip42: info.supportsNip42,
              checkedAt: Date.now(),
            }
          : undefined,
      };
    }));
    nostrDevLog("relay", "Relay state initialized as connecting", {
      relayUrls: resolvedDefaultRelays,
    });
    resolvedDefaultRelays.forEach((relayUrl) => {
      void probeRelayInfo(relayUrl);
    });

    setNdk(ndkInstance);

    // Restore session first, then connect so protected REQs don't race ahead of signer readiness.
    let extensionRestoreController: AbortController | undefined;
    let reconcileIntervalId: number | undefined;
    const restoreSession = async (): Promise<void> => {
      const savedAuthMethod = localStorage.getItem(STORAGE_KEY_AUTH) as AuthMethod;
      if (savedAuthMethod === "guest") {
        const savedNsec = localStorage.getItem(STORAGE_KEY_NSEC);
        if (!savedNsec) return;
        try {
          const signer = new NDKPrivateKeySigner(savedNsec);
          ndkInstance.signer = signer;
          const ndkUser = await signer.user();
          if (disposed) return;
          setUser({
            pubkey: ndkUser.pubkey,
            npub: ndkUser.npub,
          });
          setAuthMethod("guest");
        } catch {
          if (disposed) return;
          localStorage.removeItem(STORAGE_KEY_AUTH);
        }
        return;
      }

      if (savedAuthMethod === "extension") {
        extensionRestoreController = new AbortController();
        const availableImmediately = hasNostrExtension();
        nostrDevLog("auth", "Attempting extension session restore", {
          immediateAvailability: availableImmediately,
        });

        const isExtensionAvailable = availableImmediately
          ? true
          : await waitForNostrExtensionAvailability({ signal: extensionRestoreController.signal });

        if (!isExtensionAvailable) {
          if (disposed) return;
          nostrDevLog("auth", "Extension restore failed: extension unavailable after wait window");
          localStorage.removeItem(STORAGE_KEY_AUTH);
          return;
        }

        const signer = new NDKNip07Signer();
        ndkInstance.signer = signer;
        try {
          const ndkUser = await signer.user();
          if (disposed) return;
          setUser({
            pubkey: ndkUser.pubkey,
            npub: ndkUser.npub,
          });
          setAuthMethod("extension");
          nostrDevLog("auth", "Extension session restored", { pubkey: ndkUser.pubkey });
        } catch (error) {
          if (disposed) return;
          nostrDevLog("auth", "Extension restore failed while resolving signer user", {
            error: error instanceof Error ? error.message : String(error),
          });
          localStorage.removeItem(STORAGE_KEY_AUTH);
        }
        return;
      }

      if (savedAuthMethod === "nostrConnect") {
        const bunkerUrl = localStorage.getItem(STORAGE_KEY_NIP46_BUNKER);
        const localKey = localStorage.getItem(STORAGE_KEY_NIP46_LOCAL_NSEC) || undefined;
        if (!bunkerUrl) {
          localStorage.removeItem(STORAGE_KEY_AUTH);
          return;
        }
        const signer = NDKNip46Signer.bunker(ndkInstance, bunkerUrl, localKey);
        ndkInstance.signer = signer;
        try {
          const ndkUser: NDKUser = await signer.blockUntilReady();
          if (disposed) return;
          await ndkUser.fetchProfile();
          if (disposed) return;
          setUser({
            pubkey: ndkUser.pubkey,
            npub: ndkUser.npub,
            profile: {
              name: ndkUser.profile?.name,
              displayName: ndkUser.profile?.displayName,
              picture: ndkUser.profile?.image,
              about: ndkUser.profile?.about,
              nip05: ndkUser.profile?.nip05,
            },
          });
          setAuthMethod("nostrConnect");
        } catch {
          if (disposed) return;
          localStorage.removeItem(STORAGE_KEY_AUTH);
          localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
          localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
        }
      }
    };

    void (async () => {
      await restoreSession();
      if (disposed) return;
      ndkInstance.connect().then(() => {
        nostrDevLog("provider", "NDK connected to relay pool");
        syncRelayStatusesFromPool();
      });
      reconcileIntervalId = window.setInterval(
        syncRelayStatusesFromPool,
        RELAY_STATUS_RECONCILE_INTERVAL_MS
      );
    })();

    return () => {
      disposed = true;
      extensionRestoreController?.abort();
      if (typeof reconcileIntervalId === "number") {
        window.clearInterval(reconcileIntervalId);
      }
      ndkInstance.pool.relays.forEach((relay) => {
        relay.disconnect();
      });
      ndkInstance.pool.removeAllListeners();
    };
  }, [isResolvingDefaultRelays, markRelayVerificationSuccess, notifyRelayVerificationEvent, probeRelayInfo, resolveConnectedRelayStatus, resolvedDefaultRelays]);

  const loginWithExtension = useCallback(async (): Promise<boolean> => {
    if (!ndk) return false;
    
    if (!hasNostrExtension()) {
      console.error("No Nostr extension found");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const signer = new NDKNip07Signer();
      ndk.signer = signer;
      
      const ndkUser = await signer.user();
      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: ndkUser.profile
          ? {
              name: ndkUser.profile.name,
              displayName: ndkUser.profile.displayName,
              picture: ndkUser.profile.image,
              about: ndkUser.profile.about,
              nip05: ndkUser.profile.nip05,
            }
          : undefined,
      });
      setAuthMethod("extension");
      localStorage.setItem(STORAGE_KEY_AUTH, "extension");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Extension login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk, retryNip42RelaysAfterSignIn]);

  const loginWithPrivateKey = useCallback(async (nsecOrHex: string): Promise<boolean> => {
    if (!ndk) return false;

    setIsAuthenticating(true);
    try {
      const signer = new NDKPrivateKeySigner(nsecOrHex);
      ndk.signer = signer;
      
      const ndkUser = await signer.user();
      
      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
      });
      setAuthMethod("privateKey");
      localStorage.setItem(STORAGE_KEY_AUTH, "privateKey");
      // Don't store private key for security
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Private key login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk, retryNip42RelaysAfterSignIn]);

  const loginAsGuest = useCallback(async (): Promise<boolean> => {
    if (!ndk) return false;

    setIsAuthenticating(true);
    try {
      // Check for existing guest key
      const nsec = localStorage.getItem(STORAGE_KEY_NSEC);
      let signer: NDKPrivateKeySigner;
      
      if (nsec) {
        signer = new NDKPrivateKeySigner(nsec);
      } else {
        signer = NDKPrivateKeySigner.generate();
        // Store for session persistence
        const privateKey = signer.privateKey;
        if (privateKey) {
          localStorage.setItem(STORAGE_KEY_NSEC, privateKey);
        }
      }
      
      ndk.signer = signer;
      const ndkUser = await signer.user();
      
      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: {
          name: buildDeterministicGuestName(ndkUser.pubkey),
        },
      });
      setAuthMethod("guest");
      localStorage.setItem(STORAGE_KEY_AUTH, "guest");
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Guest login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk, retryNip42RelaysAfterSignIn]);

  const loginWithNostrConnect = useCallback(async (bunkerUrl: string): Promise<boolean> => {
    if (!ndk) return false;
    if (!bunkerUrl.trim().startsWith("bunker://")) {
      console.error("Invalid NIP-46 bunker URL");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const localKey = localStorage.getItem(STORAGE_KEY_NIP46_LOCAL_NSEC) || undefined;
      const signer = NDKNip46Signer.bunker(ndk, bunkerUrl.trim(), localKey);
      ndk.signer = signer;

      const ndkUser = await signer.blockUntilReady();
      await ndkUser.fetchProfile();

      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: {
          name: ndkUser.profile?.name,
          displayName: ndkUser.profile?.displayName,
          picture: ndkUser.profile?.image,
          about: ndkUser.profile?.about,
          nip05: ndkUser.profile?.nip05,
        },
      });
      setAuthMethod("nostrConnect");
      localStorage.setItem(STORAGE_KEY_AUTH, "nostrConnect");
      localStorage.setItem(STORAGE_KEY_NIP46_BUNKER, bunkerUrl.trim());
      if (signer.localSigner?.privateKey) {
        localStorage.setItem(STORAGE_KEY_NIP46_LOCAL_NSEC, signer.localSigner.privateKey);
      }
      retryNip42RelaysAfterSignIn();
      return true;
    } catch (error) {
      console.error("Nostr Connect login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk, retryNip42RelaysAfterSignIn]);

  const getGuestPrivateKey = useCallback((): string | null => {
    if (authMethod !== "guest") return null;
    return localStorage.getItem(STORAGE_KEY_NSEC);
  }, [authMethod]);

  const publishPresenceOffline = useCallback(async () => {
    if (!ndk || !ndk.signer) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = NostrEventKind.UserStatus;
      event.content = buildOfflinePresenceContent();
      event.tags = buildPresenceTags(
        Math.floor(Date.now() / 1000) + NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS
      );
      await event.sign();

      const relayUrls = relays.map((relay) => relay.url);
      const relaySet = NDKRelaySet.fromRelayUrls(
        relayUrls.length > 0 ? relayUrls : resolvedDefaultRelays,
        ndk,
        true
      );
      await event.publish(relaySet);
    } catch (error) {
      console.warn("Failed to publish offline presence event during logout", error);
    }
  }, [resolvedDefaultRelays, ndk, relays]);

  const logout = useCallback(() => {
    void publishPresenceOffline();
    profileSyncRunRef.current += 1;
    setIsProfileSyncing(false);
    if (ndk) {
      ndk.signer = undefined;
    }
    setUser(null);
    setAuthMethod(null);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
    localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
    // Keep guest key for potential re-login
  }, [ndk, publishPresenceOffline]);

  const addRelay = useCallback((url: string) => {
    if (!ndk) return;
    
    if (!isRelayUrl(url)) {
      console.error("Invalid relay URL");
      return;
    }
    const normalized = normalizeRelayUrl(url);
    resetRelayConnectionTracking(normalized);
    setResolvedDefaultRelays((previous) => appendResolvedRelayUrl(previous, normalized));
    nostrDevLog("relay", "Adding relay and initiating connection", { relayUrl: normalized });
    void probeRelayInfo(normalized);

    // Add to relays state
    setRelays((prev) => {
      let next: NDKRelayStatus[];
      if (prev.some((r) => normalizeRelayUrl(r.url) === normalized)) {
        next = prev.map((r) =>
          normalizeRelayUrl(r.url) === normalized ? { ...r, url: normalized, status: "connecting" } : r
        );
        savePersistedRelayUrls(next.map((relay) => relay.url));
        return next;
      }
      const info = relayInfoRef.current.get(normalized);
      next = [...prev, {
        url: normalized,
        status: "connecting",
        nip11: info
          ? {
              authRequired: info.authRequired,
              supportsNip42: info.supportsNip42,
              checkedAt: Date.now(),
            }
          : undefined,
      }];
      savePersistedRelayUrls(next.map((relay) => relay.url));
      return next;
    });

    // Connect via NDK
    const relay = ndk.pool.getRelay(normalized, true);
    relay?.disconnect();
    relay?.connect();
  }, [ndk, probeRelayInfo, resetRelayConnectionTracking]);

  useEffect(() => {
    if (!user?.pubkey || !ndk) return;

    const normalizedNip05 = user.profile?.nip05?.trim().toLowerCase() || "";
    const syncKey = `${user.pubkey}|${normalizedNip05}`;
    if (complementaryRelaySyncKeyRef.current === syncKey) return;
    complementaryRelaySyncKeyRef.current = syncKey;

    let cancelled = false;
    void (async () => {
      const nip65RelayUrls = await fetchLatestNip65RelayUrls(user.pubkey);
      if (cancelled) return;

      const nip05RelayUrls = nip65RelayUrls.length === 0 && normalizedNip05
        ? await resolveVerifiedNip05RelayUrls(normalizedNip05, user.pubkey)
        : [];
      if (cancelled) return;

      const relaySelection = selectComplementaryRelayUrls({
        nip65RelayUrls,
        nip05RelayUrls,
      });
      if (relaySelection.relayUrls.length === 0) {
        nostrDevLog("relay", "No complementary relays discovered from profile sources", {
          pubkey: user.pubkey,
          hasNip65: nip65RelayUrls.length > 0,
          nip05Checked: nip65RelayUrls.length === 0 && Boolean(normalizedNip05),
        });
        return;
      }

      const existingRelayUrls = new Set(relays.map((relay) => relay.url.replace(/\/+$/, "")));
      const newRelayUrls = relaySelection.relayUrls.filter((relayUrl) => !existingRelayUrls.has(relayUrl.replace(/\/+$/, "")));
      if (newRelayUrls.length === 0) {
        nostrDevLog("relay", "Complementary relay discovery found no new relays", {
          pubkey: user.pubkey,
          source: relaySelection.source,
          candidateCount: relaySelection.relayUrls.length,
        });
        return;
      }

      newRelayUrls.forEach((relayUrl) => addRelay(relayUrl));
      nostrDevLog("relay", "Added complementary relays from profile sources", {
        pubkey: user.pubkey,
        source: relaySelection.source,
        addedRelayUrls: newRelayUrls,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [addRelay, fetchLatestNip65RelayUrls, ndk, relays, user?.profile?.nip05, user?.pubkey]);

  const removeRelay = useCallback((url: string) => {
    if (!ndk) return;

    const normalized = normalizeRelayUrl(url);

    // Mark as intentionally removed so disconnect events don't re-add it
    removedRelaysRef.current.add(normalized);
    setResolvedDefaultRelays((previous) => removeResolvedRelayUrl(previous, normalized));
    setRelays((prev) => {
      const next = prev.filter((r) => normalizeRelayUrl(r.url) !== normalized);
      savePersistedRelayUrls(next.map((relay) => relay.url));
      return next;
    });
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAutoPausedRef.current.delete(normalized);
    relayReadRejectedRef.current.delete(normalized);
    relayWriteRejectedRef.current.delete(normalized);
    relayAttemptStartedAtRef.current.delete(normalized);
    nostrDevLog("relay", "Removing relay and disconnecting", { relayUrl: normalized });
    
    const relay = ndk.pool.getRelay(normalized);
    if (relay) {
      relay.disconnect();
      ndk.pool.removeRelay(normalized);
    }
  }, [ndk]);

  const reconnectRelay = useCallback((url: string) => {
    if (!ndk) return;
    const normalized = url.replace(/\/+$/, "");
    resetRelayConnectionTracking(normalized);
    nostrDevLog("relay", "Manual relay reconnect requested", { relayUrl: normalized });

    setRelays((previous) =>
      previous.map((relay) =>
        relay.url.replace(/\/+$/, "") === normalized
          ? { ...relay, status: "connecting" }
          : relay
      )
    );

    const relay = ndk.pool.getRelay(normalized, true);
    relay?.disconnect();
    relay?.connect();
  }, [ndk, resetRelayConnectionTracking]);

  const reconnectInactiveRelaysAfterResume = useCallback((reason: "visibility" | "focus" | "online") => {
    if (!ndk) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const now = Date.now();
    if (now - lastResumeReconnectAtRef.current < RELAY_RESUME_RECONNECT_COOLDOWN_MS) {
      return;
    }

    const targets = relays
      .filter((relay) =>
        relay.status === "disconnected" ||
        relay.status === "connection-error" ||
        relay.status === "verification-failed"
      )
      .map((relay) => relay.url);

    if (targets.length === 0) return;
    lastResumeReconnectAtRef.current = now;

    nostrDevLog("relay", "Auto reconnecting relays after tab resume", {
      reason,
      relayUrls: targets,
    });

    for (const url of targets) {
      reconnectRelay(url);
    }
  }, [ndk, reconnectRelay, relays]);

  useEffect(() => {
    if (!ndk) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      reconnectInactiveRelaysAfterResume("visibility");
    };
    const handleFocus = () => {
      reconnectInactiveRelaysAfterResume("focus");
    };
    const handleOnline = () => {
      reconnectInactiveRelaysAfterResume("online");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [ndk, reconnectInactiveRelaysAfterResume]);

  const publishEvent = useCallback(async (
    kind: NostrEventKind,
    content: string,
    tags: string[][] = [],
    parentId?: string,
    relayUrls?: string[]
  ): Promise<{ success: boolean; eventId?: string; rejectionReason?: string; publishedRelayUrls?: string[] }> => {
    if (!ndk || !ndk.signer) {
      console.error("Not authenticated or NDK not ready");
      return { success: false };
    }

    let signedEventId: string | undefined;
    let targetRelayUrls: string[] = [];
    try {
      beginRelayOperation("write");
      const event = new NDKEvent(ndk);
      event.kind = kind;
      event.content = content;
      
      // Build tags
      const eventTags: string[][] = [...tags];
      
      // Add reply tag if this is a reply
      if (parentId) {
        eventTags.push(["e", parentId, "", "reply"]);
      }

      // Extract hashtags for text content kinds only.
      if (kind === NostrEventKind.TextNote || kind === NostrEventKind.Task) {
        const hashtagRegex = /#(\w+)/g;
        let match;
        while ((match = hashtagRegex.exec(content)) !== null) {
          eventTags.push(["t", match[1].toLowerCase()]);
        }
      }
      
      event.tags = eventTags;
      
      await event.sign();
      signedEventId = event.id;
      
      const normalizeRelayUrl = (url: string) => url.trim().replace(/\/+$/, "");
      const urls = (relayUrls && relayUrls.length > 0)
        ? relayUrls
        : relays.map((r) => r.url);
      targetRelayUrls = Array.from(
        new Set((urls.length > 0 ? urls : resolvedDefaultRelays).map(normalizeRelayUrl).filter(Boolean))
      );
      nostrDevLog("publish", "Preparing publish relay set", {
        kind,
        eventTagCount: eventTags.length,
        parentId: parentId || null,
        reason: relayUrls && relayUrls.length > 0 ? "explicit relay override" : "active relays fallback",
        targetRelayUrls,
      });
      const publishedRelayUrlSet = new Set<string>();
      let rejectionReason: string | undefined;

      for (const relayUrl of targetRelayUrls) {
        try {
          const relaySet = NDKRelaySet.fromRelayUrls([relayUrl], ndk, true);
          const publishedTo = await event.publish(relaySet, RELAY_PUBLISH_TIMEOUT_MS, 1);
          Array.from(publishedTo)
            .map((relay) => normalizeRelayUrl(relay.url))
            .filter(Boolean)
            .forEach((url) => publishedRelayUrlSet.add(url));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error || "");
          const extractedReason = extractRelayRejectionReason(error);
          if (!rejectionReason && extractedReason) {
            rejectionReason = extractedReason;
          }
          if (shouldMarkRelayReadOnlyAfterPublishReject({ errorMessage, rejectionReason: extractedReason })) {
            markRelayVerificationFailure(relayUrl, "write", {
              setStatus: true,
              showToast: false,
            });
          }
          nostrDevLog("publish", "Relay publish attempt failed", {
            relayUrl,
            rejectionReason: extractedReason || null,
            error: errorMessage,
          });
        }
      }

      const publishedRelayUrls = Array.from(publishedRelayUrlSet);
      if (publishedRelayUrls.length === 0) {
        console.warn("Event publish completed but no relays confirmed receipt");
        return { success: false, eventId: event.id, rejectionReason };
      }

      publishedRelayUrls.forEach((relayUrl) => {
        markRelayWriteOutcome(relayUrl, true);
      });
      nostrDevLog("publish", "Event published", {
        eventId: event.id,
        kind,
        targetRelayUrls,
        publishedRelayUrls,
      });
      return { success: true, eventId: event.id, publishedRelayUrls };
    } catch (error) {
      console.error("Failed to publish event:", error);
      const errorMessage = error instanceof Error ? error.message : String(error || "");
      const rejectionReason = extractRelayRejectionReason(error);
      if (shouldMarkRelayReadOnlyAfterPublishReject({ errorMessage, rejectionReason })) {
        const failedRelayUrls = [...targetRelayUrls];
        if (failedRelayUrls.length === 0 && relayUrls && relayUrls.length === 1) {
          failedRelayUrls.push(relayUrls[0].replace(/\/+$/, ""));
        }
        failedRelayUrls.forEach((relayUrl) => {
          markRelayVerificationFailure(relayUrl, "write", {
            setStatus: true,
            showToast: false,
          });
        });
        nostrDevLog("relay", "Publish write-rejection failure scope", {
          targetRelayUrls,
          failedRelayUrls,
          rejectionReason,
        });
      }
      return { success: false, eventId: signedEventId, rejectionReason };
    } finally {
      endRelayOperation("write");
    }
  }, [beginRelayOperation, endRelayOperation, markRelayVerificationFailure, markRelayWriteOutcome, ndk, relays, resolvedDefaultRelays]);

  const createHttpAuthHeader = useCallback(async (
    url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  ): Promise<string | null> => {
    return createNip98AuthHeader(ndk, url, method);
  }, [ndk]);

  const updateUserProfile = useCallback(async (profile: EditableNostrProfile): Promise<boolean> => {
    if (!hasRequiredProfileFields(profile)) {
      console.warn("Profile update rejected: missing required name");
      return false;
    }

    const relayUrls = relays
      .filter((relay) => relay.status === "connected")
      .map((relay) => relay.url);

    if (relayUrls.length === 0) {
      console.warn("Profile update skipped: no connected relays");
      return false;
    }

    const result = await publishEvent(
      NostrEventKind.Metadata,
      buildKind0Content(profile),
      [],
      undefined,
      relayUrls
    );

    if (!result.success) {
      return false;
    }

    let nip05Verified = false;
    if (profile.nip05) {
      nip05Verified = await verifyNip05(profile.nip05, user?.pubkey || "");
    }

    setUser((prev) => prev ? ({
      ...prev,
      profile: {
        name: profile.name.trim(),
        displayName: profile.displayName?.trim() || undefined,
        picture: profile.picture?.trim() || undefined,
        about: profile.about?.trim() || undefined,
        nip05: profile.nip05?.trim() || undefined,
        nip05Verified,
      },
    }) : prev);
    setNeedsProfileSetup(false);
    return true;
  }, [publishEvent, relays, user?.pubkey]);

  useEffect(() => {
    if (!user?.pubkey) {
      setNeedsProfileSetup(false);
      setIsProfileSyncing(false);
      return;
    }

    const baseProfile = userProfileSnapshot;
    const syncRun = profileSyncRunRef.current + 1;
    profileSyncRunRef.current = syncRun;
    let cancelled = false;
    const isStale = () => cancelled || profileSyncRunRef.current !== syncRun;

    setIsProfileSyncing(true);

    const syncProfile = async () => {
      let signerProfile: NostrUser["profile"] | null = null;
      if (ndk?.signer) {
        try {
          const signerUser = await ndk.signer.user();
          if (!isStale() && signerUser.pubkey === user.pubkey) {
            await signerUser.fetchProfile();
            if (!isStale()) {
              signerProfile = {
                name: signerUser.profile?.name,
                displayName: signerUser.profile?.displayName,
                picture: signerUser.profile?.image,
                about: signerUser.profile?.about,
                nip05: signerUser.profile?.nip05,
              };
            }
          }
        } catch (error) {
          console.warn("Profile sync: signer profile fetch failed", error);
        }
      }

      const kind0Profile = await fetchLatestKind0Profile(user.pubkey);
      if (isStale()) return;

      const mergedProfile = {
        ...(userProfileSnapshot || {}),
        ...(signerProfile || {}),
        ...(kind0Profile || {}),
      };

      let nip05Verified = false;
      if (mergedProfile.nip05) {
        nip05Verified = await verifyNip05(mergedProfile.nip05, user.pubkey);
      }
      if (isStale()) return;

      const nextProfile = {
        ...mergedProfile,
        nip05Verified,
      };

      setUser((prev) => {
        if (!prev || prev.pubkey !== user.pubkey) return prev;
        const previousProfile = prev.profile;
        const isUnchanged =
          previousProfile?.name === nextProfile.name &&
          previousProfile?.displayName === nextProfile.displayName &&
          previousProfile?.picture === nextProfile.picture &&
          previousProfile?.about === nextProfile.about &&
          previousProfile?.nip05 === nextProfile.nip05 &&
          previousProfile?.nip05Verified === nextProfile.nip05Verified;
        if (isUnchanged) return prev;
        return {
          ...prev,
          profile: nextProfile,
        };
      });
      setNeedsProfileSetup(!hasRequiredProfileFields(mergedProfile));
      setIsProfileSyncing(false);
    };

    void syncProfile().catch((error) => {
      if (isStale()) return;
      console.warn("Profile sync failed", error);
      setNeedsProfileSetup(!(baseProfile && hasRequiredProfileFields(baseProfile)));
      setIsProfileSyncing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ndk, fetchLatestKind0Profile, user?.pubkey, userProfileSnapshot]);

  const subscribe = useCallback((
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ): NDKSubscription | null => {
    if (!ndk) return null;
    nostrDevLog("subscribe", "Creating subscription", {
      filterCount: filters.length,
      filters,
    });

    beginRelayOperation("read");
    const subscription = ndk.subscribe(filters, { closeOnEose: options?.closeOnEose ?? false });
    
    subscription.on("event", (event: NDKEvent) => {
      if (event.relay?.url) {
        markRelayReadOutcome(event.relay.url, true);
      }
      onEvent(event);
    });
    subscription.on("closed", (relay: NDKRelay, reason: string) => {
      if (!isAuthRequiredCloseReason(reason || "")) return;
      nostrDevLog("relay", "Relay closed subscription due to auth failure", {
        relayUrl: relay.url,
        reason,
      });
      const normalizedRelayUrl = relay.url.replace(/\/+$/, "");
      const shouldRetry = shouldRetryAuthAfterReadRejection({
        hasSigner: Boolean(ndk.signer),
        hadPendingAuthChallenge: pendingRelayVerificationRef.current.has(normalizedRelayUrl),
        lastRetryAt: relayAuthRetryHistoryRef.current.get(normalizedRelayUrl),
        now: Date.now(),
      });
      if (shouldRetry) {
        relayAuthRetryHistoryRef.current.set(normalizedRelayUrl, Date.now());
        nostrDevLog("relay", "Retrying relay connection to trigger NIP-42 auth challenge", {
          relayUrl: normalizedRelayUrl,
        });
        relay.disconnect();
        relay.connect();
      }
      markRelayVerificationFailure(relay.url, "read", {
        setStatus: shouldSetVerificationFailedStatus("subscription-closed", "read"),
        showToast: true,
      });
    });
    let finished = false;
    const finishRead = () => {
      if (finished) return;
      finished = true;
      endRelayOperation("read");
    };
    subscription.on("eose", finishRead);
    subscription.on("close", finishRead);

    return subscription;
  }, [beginRelayOperation, endRelayOperation, markRelayReadOutcome, markRelayVerificationFailure, ndk]);

  const isConnected = useMemo(() => {
    return relays.some((r) => r.status === "connected" || r.status === "read-only");
  }, [relays]);

  const contextValue: NDKContextValue = useMemo(() => ({
    ndk,
    isConnected,
    relays: (() => {
      if (resolvedDefaultRelays.length === 0) return relays;
      return mergeConfiguredRelayStatuses({
        relays,
        configuredRelayUrls: resolvedDefaultRelays,
        removedRelayUrls: removedRelaysRef.current,
        relayInfoByUrl: relayInfoRef.current,
      });
    })(),
    user,
    authMethod,
    isAuthenticating,
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    logout,
    addRelay,
    removeRelay,
    reconnectRelay,
    publishEvent,
    createHttpAuthHeader,
    updateUserProfile,
    needsProfileSetup,
    isProfileSyncing,
    subscribe,
    getGuestPrivateKey,
    
  }), [
    ndk,
    isConnected,
    relays,
    resolvedDefaultRelays,
    user,
    authMethod,
    isAuthenticating,
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    logout,
    addRelay,
    removeRelay,
    reconnectRelay,
    publishEvent,
    createHttpAuthHeader,
    updateUserProfile,
    needsProfileSetup,
    isProfileSyncing,
    subscribe,
    getGuestPrivateKey,
  ]);

  return (
    <NDKContext.Provider value={contextValue}>
      {children}
    </NDKContext.Provider>
  );
}

export function useNDK(): NDKContextValue {
  const context = useContext(NDKContext);
  if (!context) {
    throw new Error("useNDK must be used within an NDKProvider");
  }
  return context;
}
