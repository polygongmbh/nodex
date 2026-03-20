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
import { NostrEventKind } from "@/lib/nostr/types";
import { isValidNoasBaseUrl, NoasClient, normalizeNoasBaseUrl, resolveNoasApiBaseUrl, type NoasAuthResult } from "@/lib/nostr/noas-client";
import { privateKeyHexToNsec } from "@/lib/nostr/nip49-utils";
import {
  buildKind0Content,
  hasRequiredProfileFields,
  mergeKind0Profiles,
  type EditableNostrProfile,
} from "@/infrastructure/nostr/profile-metadata";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { buildDeterministicGuestName } from "@/lib/guest-name";
import { getConfiguredDefaultRelays } from "@/infrastructure/nostr/default-relays";
import { isRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { extractHashtagsFromContent } from "@/lib/hashtags";
import { extractNostrReferenceTagsFromContent } from "@/lib/nostr/content-references";
import type { AuthMethod, NDKContextValue, NDKProviderProps, NDKRelayStatus, NostrUser } from "./contracts";
import {
  hasNostrExtension,
  loadPersistedRelayUrls,
  savePersistedRelayUrls,
  STORAGE_KEY_AUTH,
  STORAGE_KEY_NIP46_BUNKER,
  STORAGE_KEY_NIP46_LOCAL_NSEC,
  STORAGE_KEY_NSEC,
  STORAGE_KEY_NOAS_USERNAME,
} from "./storage";
import {
  mapNativeRelayStatus,
  MAX_INITIAL_CONNECT_FAILURES,
  RELAY_STATUS_RECONCILE_INTERVAL_MS,
} from "./relay-status";
import { waitForNostrExtensionAvailability } from "./session-restore";
import { verifyNip05 } from "@/lib/nostr/nip05-verify";
import { createRelayNip42AuthPolicy, type RelayVerificationEvent } from "@/infrastructure/nostr/nip42-relay-auth-policy";
import { createNip98AuthHeader } from "@/lib/nostr/nip98-http-auth";
import {
  isAuthRequiredCloseReason,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldReconnectRelayAfterSignIn,
  shouldRetryAuthAfterReadRejection,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import {
  extractRelayErrorMessage,
  extractRelayRejectionReason,
} from "./relay-error";
import { applyPerformanceAwareSubscriptionLimits } from "./subscription-limits";
import { fetchRelayInfo, type RelayInfoSummary } from "@/infrastructure/nostr/relay-info";
import i18n from "@/lib/i18n/config";
import { toast } from "sonner";
export type { AuthMethod, NostrUser, NDKRelayStatus, NDKContextValue } from "./contracts";

const NDKContext = createContext<NDKContextValue | null>(null);
const RELAY_VERIFICATION_TOAST_DEDUPE_MS = 15000;
const RELAY_PUBLISH_TIMEOUT_MS = 3000;
type RelayOperation = "read" | "write" | "unknown";
const normalizeRelayUrl = (url: string) => url.replace(/\/+$/, "");

export function NDKProvider({ children, defaultRelays }: NDKProviderProps) {
  const configuredDefaultRelays = useMemo(
    () => defaultRelays || getConfiguredDefaultRelays(),
    [defaultRelays]
  );
  const resolvedDefaultRelays = useMemo(() => {
    const persisted = loadPersistedRelayUrls();
    return persisted ?? configuredDefaultRelays;
  }, [configuredDefaultRelays]);
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
  const relayTimeoutIdsRef = useRef<Set<number>>(new Set());
  const relayCurrentInstanceRef = useRef<Map<string, NDKRelay>>(new Map());

  const clearTrackedRelayTimeout = useCallback((timeoutId: number | undefined) => {
    if (typeof timeoutId !== "number") return;
    window.clearTimeout(timeoutId);
    relayTimeoutIdsRef.current.delete(timeoutId);
  }, []);

  const scheduleRelayTimeout = useCallback((callback: () => void, delayMs: number): number => {
    let timeoutId = 0;
    timeoutId = window.setTimeout(() => {
      relayTimeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delayMs);
    relayTimeoutIdsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  const clearAllTrackedRelayTimeouts = useCallback(() => {
    relayTimeoutIdsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    relayTimeoutIdsRef.current.clear();
  }, []);

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
      // Unknown auth challenge context: clear stale read rejection to avoid sticky red state.
      markRelayReadOutcome(relayUrl, true);
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
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
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

  const disconnectTrackedRelayInstance = useCallback((ndkInstance: NDK, relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const trackedRelay = relayCurrentInstanceRef.current.get(normalizedRelayUrl);
    const pooledRelay = ndkInstance.pool.relays.get(normalizedRelayUrl);

    relayCurrentInstanceRef.current.delete(normalizedRelayUrl);

    if (trackedRelay) {
      trackedRelay.disconnect();
    }
    if (pooledRelay && pooledRelay !== trackedRelay) {
      pooledRelay.disconnect();
    }

    ndkInstance.pool.removeRelay(normalizedRelayUrl);
  }, []);

  const connectManagedRelay = useCallback((
    ndkInstance: NDK,
    relayUrl: string,
    options?: { forceNewSocket?: boolean }
  ): NDKRelay => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const forceNewSocket = options?.forceNewSocket ?? false;
    const trackedRelay =
      relayCurrentInstanceRef.current.get(normalizedRelayUrl) ??
      ndkInstance.pool.relays.get(normalizedRelayUrl);

    if (trackedRelay && !forceNewSocket) {
      relayCurrentInstanceRef.current.set(normalizedRelayUrl, trackedRelay);
      const mappedStatus = mapNativeRelayStatus(trackedRelay.status);
      if (mappedStatus === "connected" || mappedStatus === "connecting") {
        return trackedRelay;
      }
      trackedRelay.connect();
      return trackedRelay;
    }

    if (forceNewSocket) {
      disconnectTrackedRelayInstance(ndkInstance, normalizedRelayUrl);
    }

    const relay = ndkInstance.pool.getRelay(normalizedRelayUrl, false);
    relayCurrentInstanceRef.current.set(normalizedRelayUrl, relay);
    relay.connect();
    return relay;
  }, [disconnectTrackedRelayInstance]);

  const retryNip42RelaysAfterSignIn = useCallback(() => {
    if (!ndk) return;
    const relayUrlsToRetry = relays
      .filter((relay) => shouldReconnectRelayAfterSignIn(relay))
      .map((relay) => normalizeRelayUrl(relay.url));

    if (relayUrlsToRetry.length === 0) return;

    const retrySet = new Set(relayUrlsToRetry);
    nostrDevLog("relay", "Retrying NIP-42 auth-capable relays after sign in", {
      relayUrls: relayUrlsToRetry,
    });

    setRelays((previous) =>
      previous.map((relay) =>
        retrySet.has(normalizeRelayUrl(relay.url))
          ? { ...relay, status: "connecting" }
          : relay
      )
    );

    relayUrlsToRetry.forEach((relayUrl) => {
      relayAutoPausedRef.current.delete(relayUrl);
      relayInitialFailureCountsRef.current.delete(relayUrl);
      relayAuthRetryHistoryRef.current.delete(relayUrl);
      pendingRelayVerificationRef.current.delete(relayUrl);
      relayReadRejectedRef.current.delete(relayUrl);
      connectManagedRelay(ndk, relayUrl);
    });
  }, [connectManagedRelay, ndk, relays]);

  const fetchLatestKind0Profile = useCallback(async (pubkey: string): Promise<NostrUser["profile"] | null> => {
    if (!ndk) return null;

    return await new Promise((resolve) => {
      const candidates: { createdAt: number; content: string }[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTrackedRelayTimeout(fallbackTimeoutId);
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
      const fallbackTimeoutId = scheduleRelayTimeout(finish, 12000);
    });
  }, [beginRelayOperation, clearTrackedRelayTimeout, endRelayOperation, ndk, scheduleRelayTimeout]);

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
      setRelays((prev) => {
        const nextByUrl = new Map(prev.map((entry) => [normalizeRelayUrl(entry.url), entry]));
        ndkInstance.pool.relays.forEach((relay: NDKRelay) => {
          const normalized = normalizeRelayUrl(relay.url);
          const currentRelay = relayCurrentInstanceRef.current.get(normalized);
          if (currentRelay && currentRelay !== relay) return;
          relayCurrentInstanceRef.current.set(normalized, relay);
          if (removedRelaysRef.current.has(normalized)) return;
          const previousEntry = nextByUrl.get(normalized);
          if (relayAutoPausedRef.current.has(normalized)) {
            nextByUrl.set(normalized, {
              ...previousEntry,
              url: normalized,
              status: "connection-error",
            });
            return;
          }
          const mappedStatus = mapNativeRelayStatus(relay.status);
          nextByUrl.set(normalized, {
            ...previousEntry,
            url: normalized,
            status: mappedStatus === "connected"
              ? resolveConnectedRelayStatus(normalized)
              : mappedStatus,
          });
        });
        return Array.from(nextByUrl.values());
      });
    };

    ndkInstance.pool.on("relay:connecting", () => {
      syncRelayStatusesFromPool();
    });

    ndkInstance.pool.on("relay:connect", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      const currentRelay = relayCurrentInstanceRef.current.get(normalized);
      if (currentRelay && currentRelay !== relay) {
        return;
      }
      relayCurrentInstanceRef.current.set(normalized, relay);
      nostrDevLog("relay", "Relay connected", { relayUrl: normalized });
      relayConnectedOnceRef.current.add(normalized);
      relayInitialFailureCountsRef.current.delete(normalized);
      relayAutoPausedRef.current.delete(normalized);
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
        return [...prev, {
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
      });
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      nostrDevLog("relay", "Relay disconnected", { relayUrl: normalized });
      const currentRelay = relayCurrentInstanceRef.current.get(normalized);
      if (currentRelay && currentRelay !== relay) {
        return;
      }
      const activeRelay = ndkInstance.pool.relays.get(normalized);

      // Ignore late disconnects from a removed relay instance after the same normalized URL
      // has already been re-added to the pool.
      if (activeRelay && activeRelay !== relay) {
        return;
      }

      // Do not overwrite "connection-error" with "disconnected": pool.removeRelay() fires a
      // second relay:disconnect after auto-pause, which would clobber the error status.
      if (!removedRelaysRef.current.has(normalized) && !relayAutoPausedRef.current.has(normalized)) {
        setRelays((prev) =>
          prev.map((r) =>
            normalizeRelayUrl(r.url) === normalized ? { ...r, status: "disconnected" } : r
          )
        );
      }

      if (relayAutoPausedRef.current.has(normalized)) return;

      if (relayConnectedOnceRef.current.has(normalized)) {
        // Relay had connected before. NDK normally handles reconnection via handleReconnection(),
        // but NDK's handleStaleConnection() (wsStateMonitor / keepalive probe) sets status to
        // DISCONNECTED *before* calling onDisconnect(), so handleReconnection is never scheduled.
        // Scheduling relay.connect() here covers that gap; NDK's internal guard makes it a no-op
        // if NDK is already reconnecting.
        if (!removedRelaysRef.current.has(normalized)) {
          scheduleRelayTimeout(() => {
            if (
              relayCurrentInstanceRef.current.get(normalized) === relay &&
              !removedRelaysRef.current.has(normalized) &&
              !relayAutoPausedRef.current.has(normalized)
            ) {
              relay.connect();
            }
          }, 3000);
        }
        return;
      }

      // Relay has never connected. NDK skips handleReconnection() when the initial WebSocket
      // closes while still in CONNECTING state (because status wasn't CONNECTED). Track failures
      // and schedule retries with exponential backoff ourselves.
      const nextFailureCount = (relayInitialFailureCountsRef.current.get(normalized) ?? 0) + 1;
      relayInitialFailureCountsRef.current.set(normalized, nextFailureCount);

      if (nextFailureCount < MAX_INITIAL_CONNECT_FAILURES) {
        if (!removedRelaysRef.current.has(normalized)) {
          const delay = Math.min(1000 * 2 ** (nextFailureCount - 1), 30000);
          scheduleRelayTimeout(() => {
            if (
              relayCurrentInstanceRef.current.get(normalized) === relay &&
              !removedRelaysRef.current.has(normalized) &&
              !relayAutoPausedRef.current.has(normalized)
            ) {
              relay.connect();
            }
          }, delay);
        }
        return;
      }

      relayAutoPausedRef.current.add(normalized);
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
    relayCurrentInstanceRef.current.clear();
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
    const reconcileIntervalId = window.setInterval(
      syncRelayStatusesFromPool,
      RELAY_STATUS_RECONCILE_INTERVAL_MS
    );
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
    })();
    const relayCurrentInstance = relayCurrentInstanceRef.current;

    return () => {
      disposed = true;
      extensionRestoreController?.abort();
      window.clearInterval(reconcileIntervalId);
      clearAllTrackedRelayTimeouts();
      ndkInstance.pool.removeAllListeners();
      ndkInstance.pool.relays.forEach((relay) => {
        relay.disconnect();
      });
      relayCurrentInstance.clear();
    };
  }, [clearAllTrackedRelayTimeouts, markRelayVerificationSuccess, notifyRelayVerificationEvent, probeRelayInfo, resolveConnectedRelayStatus, resolvedDefaultRelays, scheduleRelayTimeout]);

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



  const addRelay = useCallback((url: string) => {
    if (!ndk) return;

    if (!isRelayUrl(url)) {
      console.error("Invalid relay URL");
      return;
    }
    const normalized = normalizeRelayUrl(url);
    removedRelaysRef.current.delete(normalized);
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAutoPausedRef.current.delete(normalized);
    nostrDevLog("relay", "Adding relay and initiating connection", { relayUrl: normalized });
    void probeRelayInfo(normalized);

    // Keep NDK's explicit relay list in sync so subscription routing includes this relay.
    // NDK's pool monitor uses explicitRelayUrls to decide whether to send REQ to newly
    // connected relays for existing subscriptions.
    if (!ndk.explicitRelayUrls?.some((entry) => normalizeRelayUrl(entry) === normalized)) {
      ndk.explicitRelayUrls = [...(ndk.explicitRelayUrls || []), normalized];
    }

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

    // Connect via NDK. Use connect=false so NDK does not auto-connect (we do it manually
    // exactly once). The pool-level relay:connect / relay:disconnect handlers set up in the
    // useEffect correctly update status via resolveConnectedRelayStatus; we do not attach
    // per-relay listeners here to avoid: hardcoded "connected" overriding write-rejected
    // state, leaked beginRelayOperation("read") calls, and listener accumulation on re-add.
    connectManagedRelay(ndk, normalized);
  }, [connectManagedRelay, ndk, probeRelayInfo]);

  const loginWithNoas = useCallback(async (
    username: string,
    password: string,
    config?: { baseUrl?: string }
  ): Promise<NoasAuthResult> => {
    if (!ndk) return { success: false, errorCode: "server_error" };

    const submittedNoasBaseUrl = normalizeNoasBaseUrl(config?.baseUrl || import.meta.env.VITE_NOAS_HOST_URL || import.meta.env.VITE_NOAS_API_URL || "");

    if (!submittedNoasBaseUrl) {
      console.error("Noas configuration missing");
      return { success: false, errorCode: "missing_config" };
    }

    if (!isValidNoasBaseUrl(submittedNoasBaseUrl)) {
      console.error("Invalid Noas base URL");
      return { success: false, errorCode: "invalid_url" };
    }

    setIsAuthenticating(true);
    try {
      const noasApiUrl = await resolveNoasApiBaseUrl(submittedNoasBaseUrl);

      if (!isValidNoasBaseUrl(noasApiUrl)) {
        console.error("Resolved Noas API base URL is invalid");
        return { success: false, errorCode: "invalid_url" };
      }

      const noasClient = new NoasClient(noasApiUrl);
      const signInResponse = await noasClient.signIn(username, password);

      if (!signInResponse.success || !signInResponse.encryptedPrivateKey || !signInResponse.publicKey) {
        console.error("Noas sign-in failed:", signInResponse.error);
        return {
          success: false,
          errorCode: signInResponse.errorCode || "server_error",
          errorMessage: signInResponse.error,
        };
      }

      // Decrypt the NIP-49 encrypted private key using the user's password
      let decryptedPrivateKey: string;
      let signer: NDKPrivateKeySigner | null = null;
      try {
        decryptedPrivateKey = await noasClient.decryptPrivateKey(signInResponse.encryptedPrivateKey, password);

        // Convert hex key to nsec format for better compatibility with NDK
        const nsecKey = privateKeyHexToNsec(decryptedPrivateKey);
        signer = new NDKPrivateKeySigner(nsecKey);
        ndk.signer = signer;
      } catch (decryptionError) {
        console.error('Failed to decrypt private key:', decryptionError);
        setIsAuthenticating(false);
        return { success: false, errorCode: "decryption_failed" };
      }

      // Check if signer was created successfully
      if (!signer) {
        console.error('Signer was not created during decryption');
        setIsAuthenticating(false);
        return { success: false, errorCode: "decryption_failed" };
      }

      const ndkUser = await signer.user();
      if (ndkUser.pubkey.toLowerCase() !== signInResponse.publicKey.toLowerCase()) {
        console.error("Noas sign-in key mismatch: decrypted signer pubkey does not match server response", {
          username,
          signerPubkey: ndkUser.pubkey,
          responsePubkey: signInResponse.publicKey,
        });
        return { success: false, errorCode: "key_mismatch" };
      }
      await ndkUser.fetchProfile();

      // Get profile picture if available
      let profilePicture: string | undefined;
      const pictureResponse = await noasClient.getProfilePicture(signInResponse.publicKey);
      if (pictureResponse.profilePicture && pictureResponse.profilePictureType) {
        const blob = new Blob([pictureResponse.profilePicture as BlobPart], { type: pictureResponse.profilePictureType });
        profilePicture = URL.createObjectURL(blob);
      }

      // Get NIP-05 verification
      const nip05Response = await noasClient.getNip05Verification(username);
      const nip05Verified = nip05Response.names?.[username] === signInResponse.publicKey;

      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: {
          name: ndkUser.profile?.name || username,
          displayName: ndkUser.profile?.displayName || username,
          picture: profilePicture || ndkUser.profile?.image,
          about: ndkUser.profile?.about,
          nip05: noasClient.getNip05Identifier(username),
          nip05Verified,
        },
      });

      // Store Noas session information
      setAuthMethod("noas");
      localStorage.setItem(STORAGE_KEY_AUTH, "noas");
      localStorage.setItem(STORAGE_KEY_NOAS_USERNAME, username);
      
      // Store relays if provided
      if (signInResponse.relays && signInResponse.relays.length > 0) {
        const relaySet = new Set([...resolvedDefaultRelays, ...signInResponse.relays]);
        signInResponse.relays.forEach((relayUrl) => {
          if (isRelayUrl(relayUrl)) {
            addRelay(relayUrl);
          }
        });
      }

      retryNip42RelaysAfterSignIn();
      return { success: true };
    } catch (error) {
      console.error("Noas login failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk, retryNip42RelaysAfterSignIn, resolvedDefaultRelays, addRelay]);

  const signupWithNoas = useCallback(async (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string }
  ): Promise<NoasAuthResult> => {
    if (!ndk) return { success: false, errorCode: "server_error" };

    const submittedNoasBaseUrl = normalizeNoasBaseUrl(config?.baseUrl || import.meta.env.VITE_NOAS_HOST_URL || import.meta.env.VITE_NOAS_API_URL || "");

    if (!submittedNoasBaseUrl) {
      console.error("Noas configuration missing");
      return { success: false, errorCode: "missing_config" };
    }

    if (!isValidNoasBaseUrl(submittedNoasBaseUrl)) {
      console.error("Invalid Noas base URL");
      return { success: false, errorCode: "invalid_url" };
    }

    setIsAuthenticating(true);
    try {
      const noasApiUrl = await resolveNoasApiBaseUrl(submittedNoasBaseUrl);

      if (!isValidNoasBaseUrl(noasApiUrl)) {
        console.error("Resolved Noas API base URL is invalid");
        return { success: false, errorCode: "invalid_url" };
      }

      const noasClient = new NoasClient(noasApiUrl);
      
      // Normalize the private key to nsec format
      let nsecKey: string;
      try {
        if (privateKey.startsWith('nsec1')) {
          nsecKey = privateKey;
        } else if (/^[a-f0-9]{64}$/i.test(privateKey)) {
          // Convert hex to nsec
          nsecKey = privateKeyHexToNsec(privateKey);
        } else {
          setIsAuthenticating(false);
          console.error("Invalid private key format");
          return { success: false, errorCode: "server_error" };
        }
      } catch (error) {
        console.error("Failed to normalize private key:", error);
        setIsAuthenticating(false);
        return { success: false, errorCode: "server_error" };
      }

      // Register the user
      const signUpResponse = await noasClient.register(username, password, nsecKey, pubkey, resolvedDefaultRelays);

      if (!signUpResponse.success || !signUpResponse.user) {
        console.error("Noas sign-up failed:", signUpResponse.error);
        setIsAuthenticating(false);
        return {
          success: false,
          errorCode: signUpResponse.errorCode || "server_error",
          errorMessage: signUpResponse.error,
        };
      }

      // Create signer with the private key
      let signer: NDKPrivateKeySigner | null = null;
      try {
        signer = new NDKPrivateKeySigner(nsecKey);
        ndk.signer = signer;
      } catch (error) {
        console.error('Failed to create signer:', error);
        setIsAuthenticating(false);
        return { success: false, errorCode: "server_error" };
      }

      if (!signer) {
        console.error('Signer was not created');
        setIsAuthenticating(false);
        return { success: false, errorCode: "server_error" };
      }

      const ndkUser = await signer.user();
      await ndkUser.fetchProfile();

      // Get profile picture if available
      let profilePicture: string | undefined;
      const pictureResponse = await noasClient.getProfilePicture(signUpResponse.user.publicKey);
      if (pictureResponse.profilePicture && pictureResponse.profilePictureType) {
        const blob = new Blob([pictureResponse.profilePicture as BlobPart], { type: pictureResponse.profilePictureType });
        profilePicture = URL.createObjectURL(blob);
      }

      // Get NIP-05 verification
      const nip05Response = await noasClient.getNip05Verification(username);
      const nip05Verified = nip05Response.names?.[username] === signUpResponse.user.publicKey;

      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: {
          name: ndkUser.profile?.name || username,
          displayName: ndkUser.profile?.displayName || username,
          picture: profilePicture || ndkUser.profile?.image,
          about: ndkUser.profile?.about,
          nip05: noasClient.getNip05Identifier(username),
          nip05Verified,
        },
      });

      // Store Noas session information
      setAuthMethod("noas");
      localStorage.setItem(STORAGE_KEY_AUTH, "noas");
      localStorage.setItem(STORAGE_KEY_NOAS_USERNAME, username);

      retryNip42RelaysAfterSignIn();
      return { success: true };
    } catch (error) {
      console.error("Noas sign-up failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk, retryNip42RelaysAfterSignIn, resolvedDefaultRelays]);

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



  const removeRelay = useCallback((url: string) => {
    if (!ndk) return;

    const normalized = normalizeRelayUrl(url);

    // Mark as intentionally removed so disconnect events don't re-add it
    removedRelaysRef.current.add(normalized);
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
    nostrDevLog("relay", "Removing relay and disconnecting", { relayUrl: normalized });

    // Remove from NDK's explicit relay list so subscriptions stop routing to it.
    ndk.explicitRelayUrls = ndk.explicitRelayUrls?.filter((u) => normalizeRelayUrl(u) !== normalized);

    disconnectTrackedRelayInstance(ndk, normalized);
  }, [disconnectTrackedRelayInstance, ndk]);

  const reconnectRelay = useCallback((url: string, options?: { forceNewSocket?: boolean }) => {
    if (!ndk) return;
    const normalized = normalizeRelayUrl(url);
    const forceNewSocket = options?.forceNewSocket ?? false;
    removedRelaysRef.current.delete(normalized);
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAutoPausedRef.current.delete(normalized);
    relayReadRejectedRef.current.delete(normalized);
    relayWriteRejectedRef.current.delete(normalized);
    pendingRelayVerificationRef.current.delete(normalized);
    relayAuthRetryHistoryRef.current.delete(normalized);
    nostrDevLog("relay", "Relay reconnect requested", {
      relayUrl: normalized,
      reconnectMode: forceNewSocket ? "hard" : "soft",
    });

    const relay = connectManagedRelay(ndk, normalized, { forceNewSocket });
    const mappedStatus = mapNativeRelayStatus(relay.status);
    setRelays((previous) =>
      previous.map((entry) =>
        entry.url.replace(/\/+$/, "") === normalized
          ? {
              ...entry,
              status: mappedStatus === "connected"
                ? resolveConnectedRelayStatus(normalized)
                : mappedStatus === "connecting"
                  ? "connecting"
                  : "connecting",
            }
          : entry
      )
    );
  }, [connectManagedRelay, ndk, resolveConnectedRelayStatus]);

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
        extractHashtagsFromContent(content).forEach((hashtag) => {
          eventTags.push(["t", hashtag]);
        });
        extractNostrReferenceTagsFromContent(content).forEach((tag) => {
          eventTags.push(tag);
        });
      }
      
      event.tags = eventTags;
      
      await event.sign();
      signedEventId = event.id;
      
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
          const relayErrorMessage = extractRelayErrorMessage(error, relayUrl);
          const extractedReason =
            extractRelayRejectionReason(relayErrorMessage || "") ??
            extractRelayRejectionReason(error);
          if (!rejectionReason && extractedReason) {
            rejectionReason = extractedReason;
          }
          const decisionErrorMessage = relayErrorMessage || errorMessage;
          if (shouldMarkRelayReadOnlyAfterPublishReject({
            errorMessage: decisionErrorMessage,
            rejectionReason: extractedReason,
          })) {
            markRelayVerificationFailure(relayUrl, "write", {
              setStatus: true,
              showToast: false,
            });
          }
          nostrDevLog("publish", "Relay publish attempt failed", {
            relayUrl,
            rejectionReason: extractedReason || null,
            error: decisionErrorMessage,
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

    const limitDecision = applyPerformanceAwareSubscriptionLimits(filters, typeof navigator === "undefined"
      ? undefined
      : {
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: "deviceMemory" in navigator ? (navigator as Record<string, unknown>).deviceMemory as number : undefined,
      });

    nostrDevLog("subscribe", "Creating subscription", {
      filterCount: limitDecision.filters.length,
      filters: limitDecision.filters,
      performanceClass: limitDecision.performanceClass,
      subscriptionLimitCap: limitDecision.cap,
      appliedPerformanceCap: limitDecision.changed,
    });

    beginRelayOperation("read");
    const subscription = ndk.subscribe(limitDecision.filters, { closeOnEose: options?.closeOnEose ?? false });
    
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
        connectManagedRelay(ndk, normalizedRelayUrl);
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
  }, [beginRelayOperation, connectManagedRelay, endRelayOperation, markRelayReadOutcome, markRelayVerificationFailure, ndk]);

  const isConnected = useMemo(() => {
    return relays.some((r) => r.status === "connected" || r.status === "read-only");
  }, [relays]);

  const contextValue: NDKContextValue = useMemo(() => ({
    ndk,
    isConnected,
    relays,
    user,
    authMethod,
    isAuthenticating,
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    loginWithNoas,
    signupWithNoas,
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
    user,
    authMethod,
    isAuthenticating,
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    loginWithNoas,
    signupWithNoas,
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
