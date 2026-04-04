import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import NDK, {
  type NDKCacheRelayInfo,
  NDKEvent,
  NDKSubscriptionCacheUsage,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKUser,
  NDKRelay,
  NDKFilter,
  NDKSubscription,
  profileFromEvent,
} from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { NoasClient, type NoasAuthResult } from "@/lib/nostr/noas-client";
import { isValidNoasBaseUrl, normalizeNoasBaseUrl, resolveNoasApiBaseUrl } from "@/lib/nostr/noas-discovery";
import { privateKeyHexToNsec } from "@/lib/nostr/nip49-utils";
import {
  buildKind0Content,
  hasRequiredProfileFields,
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
import type { NDKUserProfile } from "@nostr-dev-kit/ndk";
import type { AuthMethod, NDKContextValue, NDKProviderProps, NDKRelayStatus } from "./contracts";
import {
  hasNostrExtension,
  loadPersistedNoasDefaultHostUrl,
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
  mergeRelayStatusUpdates,
  MAX_INITIAL_CONNECT_FAILURES,
  RELAY_STATUS_RECONCILE_INTERVAL_MS,
} from "./relay-status";
import { reorderResolvedRelayStatuses } from "./relay-list";
import { waitForNostrExtensionAvailability } from "./session-restore";
import { createRelayNip42AuthPolicy, type RelayVerificationEvent } from "@/infrastructure/nostr/nip42-relay-auth-policy";
import { createNip98AuthHeader } from "@/lib/nostr/nip98-http-auth";
import {
  AUTH_RETRY_COOLDOWN_MS,
  isAuthRequiredCloseReason,
  isPermanentAuthDenialReason,
  shouldClearReadRejectionAfterVerificationSuccess,
  shouldClearWriteRejectionAfterVerificationSuccess,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldRetryAuthClosedSubscription,
  shouldReconnectRelayAfterSignIn,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import {
  extractRelayErrorMessage,
  extractRelayUrlsFromError,
  extractRelayRejectionReason,
} from "./relay-error";
import { applyPerformanceAwareSubscriptionLimits } from "./subscription-limits";
import { fetchRelayInfo, type RelayInfoSummary } from "@/infrastructure/nostr/relay-info";
import i18n from "@/lib/i18n/config";
import { toast } from "sonner";
import {
  createNodexCacheAdapter,
  getFreshRelayInfoSummaryFromCache,
  RELAY_NIP11_CACHE_TTL_MS,
  relayInfoSummaryToNip11Document,
} from "@/infrastructure/cache/ndk-cache-adapter";
import { buildNoasSignupOptions, resolveNoasAuthRelayUrls } from "@/infrastructure/nostr/noas-auth-helpers";
import { loadCachedKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import {
  dedupeNormalizedRelayUrls,
  filterRelayUrlsToWritableSet,
  normalizeRelayUrl,
  resolveWritableNdkRelayUrls,
} from "@/lib/nostr/relay-write-targets";
import { resolveManualRelayReconnectAction } from "@/domain/relays/relay-reconnect-policy";
export type { AuthMethod, NDKUser, NDKRelayStatus, NDKContextValue } from "./contracts";

const NDKContext = createContext<NDKContextValue | null>(null);
const RELAY_VERIFICATION_TOAST_DEDUPE_MS = 15000;
const RELAY_PUBLISH_TIMEOUT_MS = 3000;
const RELAY_AUTH_PREFLIGHT_TIMEOUT_MS = 4000;
const KIND0_PROFILE_CACHE_TTL_MS = 120000;
const KIND0_PROFILE_FAILURE_COOLDOWN_MS = 15000;
type RelayOperation = "read" | "write" | "unknown";
const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;

function resolveOfflinePresenceRelayUrls(params: {
  relayUrlsOverride?: string[];
  registeredRelayUrls?: string[];
  writableRelayUrls?: string[];
}): string[] {
  return filterRelayUrlsToWritableSet([
    ...(params.relayUrlsOverride || []),
    ...(params.registeredRelayUrls || []),
  ], new Set(dedupeNormalizedRelayUrls(params.writableRelayUrls || [])));
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

function mapRelayTransportStatus(relay: NDKRelay): NDKRelayStatus["status"] {
  const mappedStatus = mapNativeRelayStatus(relay.status);
  const connectivity = (relay as unknown as { connectivity?: { ws?: { readyState?: number } } }).connectivity;
  if (!connectivity) return mappedStatus;
  const wsReadyState = connectivity.ws?.readyState;

  if (mappedStatus === "connecting") {
    if (wsReadyState === WS_READY_STATE_CONNECTING) return "connecting";
    return "disconnected";
  }
  if (mappedStatus === "connected") {
    if (wsReadyState === WS_READY_STATE_OPEN) return "connected";
    return "disconnected";
  }

  return mappedStatus;
}

function profileFromCachedKind0(pubkey: string): NDKUserProfile | undefined {
  const events = loadCachedKind0Events().filter(e => e.pubkey === pubkey);
  if (events.length === 0) return undefined;
  const best = events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
  const event = new NDKEvent();
  event.content = best.content;
  return profileFromEvent(event);
}

export function NDKProvider({ children, defaultRelays, defaultNoasHostUrl }: NDKProviderProps) {
  const configuredDefaultRelays = useMemo(
    () => defaultRelays || getConfiguredDefaultRelays(),
    [defaultRelays]
  );
  const configuredDefaultNoasHostUrl = useMemo(
    () =>
      normalizeNoasBaseUrl(
        defaultNoasHostUrl
        || import.meta.env.VITE_NOAS_HOST_URL
        || loadPersistedNoasDefaultHostUrl()
        || ""
      ),
    [defaultNoasHostUrl]
  );
  const resolvedDefaultRelays = useMemo(() => {
    const persisted = loadPersistedRelayUrls();
    return persisted ?? configuredDefaultRelays;
  }, [configuredDefaultRelays]);
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NDKUser | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [relays, setRelays] = useState<NDKRelayStatus[]>([]);
  const relaysRef = useRef<NDKRelayStatus[]>([]);
  relaysRef.current = relays;
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
  const presenceRelayUrlsRef = useRef<string[]>([]);
  const relayAuthPreflightHistoryRef = useRef<Map<string, number>>(new Map());
  const relayInfoRef = useRef<Map<string, RelayInfoSummary>>(new Map());
  const relayInfoFetchedAtRef = useRef<Map<string, number>>(new Map());
  const relayReadRejectedRef = useRef<Map<string, boolean>>(new Map());
  const relayWriteRejectedRef = useRef<Map<string, boolean>>(new Map());
  const relayTimeoutIdsRef = useRef<Set<number>>(new Set());
  const relaysPendingAuthSubscriptionReplayRef = useRef<Set<string>>(new Set());
  const kind0ProfileCacheRef = useRef<Map<string, { profile: NDKUserProfile | null; fetchedAt: number }>>(new Map());
  const kind0ProfileInFlightRef = useRef<Map<string, Promise<NDKUserProfile | null>>>(new Map());
  const kind0ProfileFailureUntilRef = useRef<Map<string, number>>(new Map());
  const relayCurrentInstanceRef = useRef<Map<string, NDKRelay>>(new Map());
  const relayOkRejectObserverRef = useRef<Map<string, { ws: WebSocket; handler: (event: MessageEvent) => void }>>(new Map());
  const relayStatusCacheAdapter = useMemo(() => createNodexCacheAdapter(), []);
  const authMethodRef = useRef<AuthMethod>(null);
  authMethodRef.current = authMethod;

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

  const detachRelayOkRejectObserver = useCallback((relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const observer = relayOkRejectObserverRef.current.get(normalizedRelayUrl);
    if (!observer) return;
    observer.ws.removeEventListener("message", observer.handler);
    relayOkRejectObserverRef.current.delete(normalizedRelayUrl);
  }, []);

  const detachAllRelayOkRejectObservers = useCallback(() => {
    relayOkRejectObserverRef.current.forEach((observer) => {
      observer.ws.removeEventListener("message", observer.handler);
    });
    relayOkRejectObserverRef.current.clear();
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
    if (shouldClearReadRejectionAfterVerificationSuccess(operation)) {
      markRelayReadOutcome(relayUrl, true);
    }
    if (shouldClearWriteRejectionAfterVerificationSuccess(operation)) {
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

  const attachRelayOkRejectObserver = useCallback((relay: NDKRelay) => {
    const normalizedRelayUrl = normalizeRelayUrl(relay.url);
    const connectivity = relay as unknown as { connectivity?: { ws?: WebSocket } };
    const ws = connectivity.connectivity?.ws;
    if (!ws) return;

    const existing = relayOkRejectObserverRef.current.get(normalizedRelayUrl);
    if (existing?.ws === ws) return;
    if (existing) {
      existing.ws.removeEventListener("message", existing.handler);
      relayOkRejectObserverRef.current.delete(normalizedRelayUrl);
    }

    const handler = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload)) return;
        const [command] = payload as [unknown, ...unknown[]];

        if (command === "CLOSED") {
          const closeReason = typeof payload[2] === "string" ? payload[2] : "";
          if (!isAuthRequiredCloseReason(closeReason)) return;
          markRelayVerificationFailure(normalizedRelayUrl, "read", {
            setStatus: shouldSetVerificationFailedStatus("subscription-closed", "read"),
            showToast: false,
          });
          nostrDevLog("relay", "Relay read rejection observed from websocket CLOSED response", {
            relayUrl: normalizedRelayUrl,
            reason: closeReason,
          });
          return;
        }

        if (command !== "OK") return;
        const ok = payload[2];
        const reason = payload[3];
        if (ok !== false || typeof reason !== "string") return;

        const rejectionReason = extractRelayRejectionReason(reason) ?? reason;
        if (!shouldMarkRelayReadOnlyAfterPublishReject({
          errorMessage: reason,
          rejectionReason,
        })) {
          return;
        }
        markRelayVerificationFailure(normalizedRelayUrl, "write", {
          setStatus: true,
          showToast: false,
        });
        nostrDevLog("relay", "Relay write rejection observed from websocket OK response", {
          relayUrl: normalizedRelayUrl,
          reason,
          rejectionReason,
        });
      } catch {
        // Ignore non-JSON relay frames.
      }
    };

    ws.addEventListener("message", handler);
    relayOkRejectObserverRef.current.set(normalizedRelayUrl, {
      ws,
      handler,
    });
  }, [markRelayVerificationFailure]);

  const notifyRelayVerificationEvent = useCallback((incoming: RelayVerificationEvent) => {
    const normalizedRelayUrl = incoming.relayUrl.replace(/\/+$/, "");
    const existingPendingVerification = pendingRelayVerificationRef.current.get(normalizedRelayUrl);
    const operation = incoming.operation === "unknown"
      ? existingPendingVerification?.operation ?? resolveRelayVerificationOperation()
      : incoming.operation;
    const event = { ...incoming, operation };

    nostrDevLog("relay", "Relay verification event", event);

    if (event.outcome === "required") {
      pendingRelayVerificationRef.current.set(normalizedRelayUrl, {
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
    const inMemoryFetchedAt = relayInfoFetchedAtRef.current.get(normalizedRelayUrl);
    const hasFreshInMemoryInfo = typeof inMemoryFetchedAt === "number"
      && relayInfoRef.current.has(normalizedRelayUrl)
      && (Date.now() - inMemoryFetchedAt) <= RELAY_NIP11_CACHE_TTL_MS;

    if (hasFreshInMemoryInfo) {
      return;
    }

    const cachedRelayStatus = relayStatusCacheAdapter.getRelayStatus?.(normalizedRelayUrl);
    const resolvedCachedRelayStatus = isPromiseLike<NDKCacheRelayInfo | undefined>(cachedRelayStatus)
      ? await cachedRelayStatus
      : cachedRelayStatus;
    const cached = getFreshRelayInfoSummaryFromCache(resolvedCachedRelayStatus, {
      now: Date.now(),
      maxAgeMs: RELAY_NIP11_CACHE_TTL_MS,
    });
    if (cached) {
      relayInfoRef.current.set(normalizedRelayUrl, cached.summary);
      relayInfoFetchedAtRef.current.set(normalizedRelayUrl, cached.fetchedAt);
      setRelays((previous) =>
        previous.map((relay) =>
          relay.url.replace(/\/+$/, "") === normalizedRelayUrl
            ? {
                ...relay,
                nip11: {
                  authRequired: cached.summary.authRequired,
                  supportsNip42: cached.summary.supportsNip42,
                  checkedAt: cached.fetchedAt,
                },
              }
            : relay
        )
      );
      nostrDevLog("relay", "Relay NIP-11 info restored from cache", {
        relayUrl: normalizedRelayUrl,
        authRequired: cached.summary.authRequired,
        supportsNip42: cached.summary.supportsNip42,
      });
      return;
    }

    const info = await fetchRelayInfo(normalizedRelayUrl);
    if (!info) {
      nostrDevLog("relay", "Relay NIP-11 info unavailable", {
        relayUrl: normalizedRelayUrl,
      });
      return;
    }
    const checkedAt = Date.now();
    relayInfoRef.current.set(normalizedRelayUrl, info);
    relayInfoFetchedAtRef.current.set(normalizedRelayUrl, checkedAt);
    void relayStatusCacheAdapter.updateRelayStatus?.(normalizedRelayUrl, {
      nip11: {
        data: relayInfoSummaryToNip11Document(info),
        fetchedAt: checkedAt,
      },
    });
    setRelays((previous) =>
      previous.map((relay) =>
        relay.url.replace(/\/+$/, "") === normalizedRelayUrl
          ? {
              ...relay,
              nip11: {
                authRequired: info.authRequired,
                supportsNip42: info.supportsNip42,
                checkedAt,
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
  }, [relayStatusCacheAdapter]);

  const primeRelayAuthChallenge = useCallback((ndkInstance: NDK, relayUrl: string) => {
    if (!ndkInstance.signer) return;

    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const now = Date.now();
    const lastPrimedAt = relayAuthPreflightHistoryRef.current.get(normalizedRelayUrl) ?? 0;
    if ((now - lastPrimedAt) < AUTH_RETRY_COOLDOWN_MS) return;
    relayAuthPreflightHistoryRef.current.set(normalizedRelayUrl, now);

    // Ask the relay for a tiny relay-scoped read to trigger NIP-42 auth flow
    // before heavier feed subscriptions fan out.
    const probeSubscription = ndkInstance.subscribe(
      [{ kinds: [NostrEventKind.Metadata as number], limit: 1 }],
      {
        closeOnEose: true,
        relayUrls: [normalizedRelayUrl],
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        groupable: false,
      }
    );
    const timeoutId = scheduleRelayTimeout(() => {
      probeSubscription.stop();
    }, RELAY_AUTH_PREFLIGHT_TIMEOUT_MS);
    probeSubscription.on("close", () => {
      clearTrackedRelayTimeout(timeoutId);
    });

    nostrDevLog("relay", "Priming relay auth challenge before scoped subscriptions", {
      relayUrl: normalizedRelayUrl,
    });
  }, [clearTrackedRelayTimeout, scheduleRelayTimeout]);

  const disconnectTrackedRelayInstance = useCallback((ndkInstance: NDK, relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const trackedRelay = relayCurrentInstanceRef.current.get(normalizedRelayUrl);
    const pooledRelay = ndkInstance.pool.relays.get(normalizedRelayUrl);

    detachRelayOkRejectObserver(normalizedRelayUrl);
    relayCurrentInstanceRef.current.delete(normalizedRelayUrl);

    if (trackedRelay) {
      trackedRelay.disconnect();
    }
    if (pooledRelay && pooledRelay !== trackedRelay) {
      pooledRelay.disconnect();
    }

    ndkInstance.pool.removeRelay(normalizedRelayUrl);
  }, [detachRelayOkRejectObserver]);

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
      const mappedStatus = mapRelayTransportStatus(trackedRelay);
      if (mappedStatus === "connected" || mappedStatus === "connecting") {
        return trackedRelay;
      }

      // Recover from stale native CONNECTING status with no active websocket attempt.
      if (mapNativeRelayStatus(trackedRelay.status) === "connecting") {
        disconnectTrackedRelayInstance(ndkInstance, normalizedRelayUrl);
        const freshRelay = ndkInstance.pool.getRelay(normalizedRelayUrl, false);
        relayCurrentInstanceRef.current.set(normalizedRelayUrl, freshRelay);
        freshRelay.connect();
        return freshRelay;
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

  const replayActiveSubscriptionsForRelay = useCallback((ndkInstance: NDK, relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const relay =
      relayCurrentInstanceRef.current.get(normalizedRelayUrl) ??
      ndkInstance.pool.relays.get(normalizedRelayUrl);
    if (!relay) return;

    const activeSubscriptions = ndkInstance.subManager?.subscriptions;
    if (!activeSubscriptions || activeSubscriptions.size === 0) return;

    let replayedSubscriptions = 0;
    activeSubscriptions.forEach((subscription) => {
      const relayFilters = subscription.relayFilters?.get(normalizedRelayUrl) ?? subscription.filters;
      if (!Array.isArray(relayFilters) || relayFilters.length === 0) return;
      relay.subscribe(subscription, relayFilters);
      replayedSubscriptions += 1;
    });

    if (replayedSubscriptions > 0) {
      nostrDevLog("relay", "Replayed active subscriptions after relay authentication", {
        relayUrl: normalizedRelayUrl,
        replayedSubscriptions,
      });
    }
  }, []);

  const retryNip42RelaysAfterSignIn = useCallback(() => {
    if (!ndk) return;
    // Flush kind-0 profile request cache so post-sign-in auth can rehydrate profile metadata immediately.
    kind0ProfileFailureUntilRef.current.clear();
    kind0ProfileCacheRef.current.clear();

    const relayUrlsToRetry = relays
      .filter((relay) => shouldReconnectRelayAfterSignIn(relay))
      .map((relay) => normalizeRelayUrl(relay.url));
    const authCapableRelayUrls = relays
      .filter((relay) => relay.nip11?.supportsNip42 || relay.nip11?.authRequired)
      .map((relay) => normalizeRelayUrl(relay.url));

    if (relayUrlsToRetry.length === 0 && authCapableRelayUrls.length === 0) return;

    const retrySet = new Set(relayUrlsToRetry);
    const authCapableSet = new Set(authCapableRelayUrls);
    const relayUrlsToTouch = new Set([...relayUrlsToRetry, ...authCapableRelayUrls]);
    nostrDevLog("relay", "Refreshing relay auth state after sign in", {
      reconnectRelayUrls: relayUrlsToRetry,
      authCapableRelayUrls,
    });

    if (retrySet.size > 0) {
      setRelays((previous) =>
        previous.map((relay) =>
          retrySet.has(normalizeRelayUrl(relay.url))
            ? { ...relay, status: "connecting" }
            : relay
        )
      );
    }

    relayUrlsToTouch.forEach((relayUrl) => {
      const isAuthCapable = authCapableSet.has(relayUrl);
      relaysPendingAuthSubscriptionReplayRef.current.add(relayUrl);
      if (retrySet.has(relayUrl)) {
        relayAutoPausedRef.current.delete(relayUrl);
        relayInitialFailureCountsRef.current.delete(relayUrl);
        relayAuthRetryHistoryRef.current.delete(relayUrl);
        pendingRelayVerificationRef.current.delete(relayUrl);
      }
      if (isAuthCapable) {
        // Force a fresh auth challenge pass immediately after sign-in.
        relayAuthPreflightHistoryRef.current.delete(relayUrl);
      }
      // Some relays emit a fresh NIP-42 challenge only on a new websocket session.
      connectManagedRelay(ndk, relayUrl, {
        forceNewSocket: isAuthCapable,
      });
      if (isAuthCapable) {
        primeRelayAuthChallenge(ndk, relayUrl);
      }
    });
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge, relays]);

  const fetchLatestKind0Profile = useCallback(async (
    pubkey: string,
    options?: { force?: boolean }
  ): Promise<NDKUserProfile | null> => {
    if (!ndk) return null;

    const normalizedPubkey = pubkey.trim().toLowerCase();
    if (!normalizedPubkey) return null;
    const force = options?.force ?? false;
    const now = Date.now();

    if (!force) {
      const cached = kind0ProfileCacheRef.current.get(normalizedPubkey);
      if (cached && (now - cached.fetchedAt) < KIND0_PROFILE_CACHE_TTL_MS) {
        return cached.profile;
      }
      const failureUntil = kind0ProfileFailureUntilRef.current.get(normalizedPubkey) ?? 0;
      if (now < failureUntil) {
        return null;
      }
      const inFlight = kind0ProfileInFlightRef.current.get(normalizedPubkey);
      if (inFlight) {
        return inFlight;
      }
    }

    const request = new Promise<NDKUserProfile | null>((resolve) => {
      const candidates: { createdAt: number; content: string }[] = [];
      let settled = false;
      const fallbackTimeout = { id: undefined as number | undefined };
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTrackedRelayTimeout(fallbackTimeout.id);
        endRelayOperation("read");
        subscription.stop();
        let profile = null;
        if (candidates.length > 0) {
          const best = candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
          const event = new NDKEvent(ndk);
          event.content = best.content;
          profile = profileFromEvent(event);
        }
        kind0ProfileCacheRef.current.set(normalizedPubkey, {
          profile,
          fetchedAt: Date.now(),
        });
        kind0ProfileFailureUntilRef.current.delete(normalizedPubkey);
        resolve(profile);
      };

      beginRelayOperation("read");
      const subscription = ndk.subscribe(
        [{ kinds: [NostrEventKind.Metadata as number], authors: [normalizedPubkey] }],
        { closeOnEose: true }
      );

      subscription.on("event", (event: NDKEvent) => {
        if (event.content) {
          candidates.push({ createdAt: event.created_at || 0, content: event.content });
        }
      });
      subscription.on("closed", (_relay: NDKRelay, reason: string) => {
        if (!isAuthRequiredCloseReason(reason || "")) return;
        const nowTs = Date.now();
        const cooldown = isPermanentAuthDenialReason(reason || "")
          ? KIND0_PROFILE_CACHE_TTL_MS
          : KIND0_PROFILE_FAILURE_COOLDOWN_MS;
        kind0ProfileFailureUntilRef.current.set(normalizedPubkey, nowTs + cooldown);
        finish();
      });
      subscription.on("eose", finish);
      subscription.on("close", finish);

      // Fallback so the UI does not hang if eose never arrives.
      fallbackTimeout.id = scheduleRelayTimeout(finish, 12000);
    }).finally(() => {
      kind0ProfileInFlightRef.current.delete(normalizedPubkey);
    });

    kind0ProfileInFlightRef.current.set(normalizedPubkey, request);
    return await request;
  }, [beginRelayOperation, clearTrackedRelayTimeout, endRelayOperation, ndk, scheduleRelayTimeout]);

  const userProfileSnapshot = useMemo<NDKUserProfile | null>(() => {
    if (!user?.profile) return null;
    return { ...user.profile };
  }, [user?.profile]);

  // Initialize NDK
  useEffect(() => {
    nostrDevLog("provider", "Initializing NDK provider", {
      configuredDefaultRelays: resolvedDefaultRelays,
    });
    const ndkInstance = new NDK({
      explicitRelayUrls: resolvedDefaultRelays,
      cacheAdapter: relayStatusCacheAdapter,
    });

    ndkInstance.relayAuthDefaultPolicy = createRelayNip42AuthPolicy(ndkInstance, notifyRelayVerificationEvent);

    // Set up relay event handlers
    const syncRelayStatusesFromPool = () => {
      setRelays((prev) => {
        const previousEntryByUrl = new Map(
          prev.map((entry) => [normalizeRelayUrl(entry.url), entry] as const)
        );
        const updates: typeof prev = [];
        ndkInstance.pool.relays.forEach((relay: NDKRelay) => {
          const normalized = normalizeRelayUrl(relay.url);
          const currentRelay = relayCurrentInstanceRef.current.get(normalized);
          if (currentRelay && currentRelay !== relay) return;
          relayCurrentInstanceRef.current.set(normalized, relay);
          if (removedRelaysRef.current.has(normalized)) return;
          const previousEntry = previousEntryByUrl.get(normalized);
          if (relayAutoPausedRef.current.has(normalized)) {
            updates.push({
              ...previousEntry,
              url: normalized,
              status: "connection-error",
            });
            return;
          }
          const mappedStatus = mapRelayTransportStatus(relay);
          updates.push({
            ...previousEntry,
            url: normalized,
            status: mappedStatus === "connected"
              ? resolveConnectedRelayStatus(normalized)
              : mappedStatus,
          });
        });
        return mergeRelayStatusUpdates(prev, updates);
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
      attachRelayOkRejectObserver(relay);
      nostrDevLog("relay", "Relay connected", { relayUrl: normalized });
      relayConnectedOnceRef.current.add(normalized);
      relayInitialFailureCountsRef.current.delete(normalized);
      relayAutoPausedRef.current.delete(normalized);
      const relayInfo = relayInfoRef.current.get(normalized);
      if (relayInfo?.authRequired) {
        primeRelayAuthChallenge(ndkInstance, normalized);
      }
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
        const checkedAt = relayInfoFetchedAtRef.current.get(normalized);
        return [...prev, {
          url: normalized,
          status: resolveConnectedRelayStatus(normalized),
          nip11: info
            ? {
                authRequired: info.authRequired,
                supportsNip42: info.supportsNip42,
                checkedAt: checkedAt ?? Date.now(),
              }
            : undefined,
        }];
      });
    });

    ndkInstance.pool.on("relay:authed", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      const pendingVerification = pendingRelayVerificationRef.current.get(normalized);
      if (pendingVerification) {
        pendingRelayVerificationRef.current.delete(normalized);
        markRelayVerificationSuccess(normalized, pendingVerification.operation);
        nostrDevLog("relay", "Relay authentication completed for pending verification challenge", {
          relayUrl: normalized,
          operation: pendingVerification.operation,
        });
      }
      const shouldReplaySubscriptions = relaysPendingAuthSubscriptionReplayRef.current.delete(normalized);
      if (shouldReplaySubscriptions) {
        replayActiveSubscriptionsForRelay(ndkInstance, normalized);
      }
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      nostrDevLog("relay", "Relay disconnected", { relayUrl: normalized });
      detachRelayOkRejectObserver(normalized);
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
    relayInfoFetchedAtRef.current.clear();
    resolvedDefaultRelays.forEach((relayUrl) => {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      const cachedRelayStatus = relayStatusCacheAdapter.getRelayStatus?.(normalizedRelayUrl);
      if (isPromiseLike<NDKCacheRelayInfo | undefined>(cachedRelayStatus)) {
        return;
      }
      const cached = getFreshRelayInfoSummaryFromCache(cachedRelayStatus, {
        now: Date.now(),
        maxAgeMs: RELAY_NIP11_CACHE_TTL_MS,
      });
      if (!cached) return;
      relayInfoRef.current.set(normalizedRelayUrl, cached.summary);
      relayInfoFetchedAtRef.current.set(normalizedRelayUrl, cached.fetchedAt);
      nostrDevLog("relay", "Relay NIP-11 info restored from startup cache", {
        relayUrl: normalizedRelayUrl,
        authRequired: cached.summary.authRequired,
        supportsNip42: cached.summary.supportsNip42,
      });
    });
    setRelays(resolvedDefaultRelays.map((url) => {
      const normalizedUrl = normalizeRelayUrl(url);
      const info = relayInfoRef.current.get(normalizedUrl);
      const checkedAt = relayInfoFetchedAtRef.current.get(normalizedUrl);
      return {
        url,
        status: "connecting",
        nip11: info
          ? {
              authRequired: info.authRequired,
              supportsNip42: info.supportsNip42,
              checkedAt: checkedAt ?? Date.now(),
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

    // Connect relays immediately; session restore runs in parallel and sets ndkInstance.signer
    // when ready. NIP-42 auth challenges are handled per-relay on-demand, so relays that require
    // auth will challenge after EOSE once the signer is available.
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
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          setUser(ndkUser);
          setAuthMethod("guest");
        } catch {
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
          nostrDevLog("auth", "Extension restore failed: extension unavailable after wait window");
          localStorage.removeItem(STORAGE_KEY_AUTH);
          return;
        }

        const signer = new NDKNip07Signer();
        ndkInstance.signer = signer;
        try {
          const ndkUser = await signer.user();
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          setUser(ndkUser);
          setAuthMethod("extension");
          nostrDevLog("auth", "Extension session restored", { pubkey: ndkUser.pubkey });
        } catch (error) {
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
          await ndkUser.fetchProfile();
          if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
          setUser(ndkUser);
          setAuthMethod("nostrConnect");
        } catch {
          localStorage.removeItem(STORAGE_KEY_AUTH);
          localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
          localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
        }
      }
    };

    void ndkInstance.connect();
    void restoreSession();
    const relayCurrentInstance = relayCurrentInstanceRef.current;
    const inFlightKind0ProfileRequests = kind0ProfileInFlightRef.current;

    return () => {
      extensionRestoreController?.abort();
      window.clearInterval(reconcileIntervalId);
      clearAllTrackedRelayTimeouts();
      detachAllRelayOkRejectObservers();
      ndkInstance.pool.removeAllListeners();
      ndkInstance.pool.relays.forEach((relay) => {
        relay.disconnect();
      });
      inFlightKind0ProfileRequests.clear();
      relayCurrentInstance.clear();
    };
  }, [attachRelayOkRejectObserver, clearAllTrackedRelayTimeouts, detachAllRelayOkRejectObservers, detachRelayOkRejectObserver, markRelayVerificationSuccess, notifyRelayVerificationEvent, primeRelayAuthChallenge, probeRelayInfo, relayStatusCacheAdapter, replayActiveSubscriptionsForRelay, resolveConnectedRelayStatus, resolvedDefaultRelays, scheduleRelayTimeout]);

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
      if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
      setUser(ndkUser);
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
      if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
      setUser(ndkUser);
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
      ndkUser.profile = { name: buildDeterministicGuestName(ndkUser.pubkey) };
      setUser(ndkUser);
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
      const profile = await fetchLatestKind0Profile(ndkUser.pubkey, { force: true });
      if (profile) ndkUser.profile = profile;
      else if (!ndkUser.profile) ndkUser.profile = profileFromCachedKind0(ndkUser.pubkey);
      setUser(ndkUser);
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
  }, [fetchLatestKind0Profile, ndk, retryNip42RelaysAfterSignIn]);



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
      const checkedAt = relayInfoFetchedAtRef.current.get(normalized);
      next = [...prev, {
        url: normalized,
        status: "connecting",
        nip11: info
          ? {
              authRequired: info.authRequired,
              supportsNip42: info.supportsNip42,
              checkedAt: checkedAt ?? Date.now(),
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

  const connectResolvedAuthRelayUrls = useCallback((relayUrls: string[]) => {
    relayUrls
      .forEach((relayUrl) => {
        addRelay(relayUrl);
      });
  }, [addRelay]);

  const reorderRelays = useCallback((orderedUrls: string[]) => {
    if (!ndk) return;

    setRelays((previous) => {
      const next = reorderResolvedRelayStatuses({
        relays: previous,
        orderedRelayUrls: orderedUrls,
      });
      if (next === previous) {
        return previous;
      }

      const nextRelayUrls = next.map((relay) => relay.url);
      ndk.explicitRelayUrls = nextRelayUrls;
      savePersistedRelayUrls(nextRelayUrls);
      nostrDevLog("relay", "Relay order updated", { relayUrls: nextRelayUrls });
      return next;
    });
  }, [ndk]);

  const loginWithNoas = useCallback(async (
    username: string,
    password: string,
    config?: { baseUrl?: string }
  ): Promise<NoasAuthResult> => {
    if (!ndk) return { success: false, errorCode: "server_error" };

    const submittedNoasBaseUrl = normalizeNoasBaseUrl(config?.baseUrl || configuredDefaultNoasHostUrl || "");

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
          httpStatus: signInResponse.httpStatus,
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
      ndkUser.profile = { name: username, displayName: username, picture: `${noasApiUrl}/picture/${ndkUser.pubkey}` };
      setUser(ndkUser);

      // Store Noas session information
      setAuthMethod("noas");
      localStorage.setItem(STORAGE_KEY_AUTH, "noas");
      localStorage.setItem(STORAGE_KEY_NOAS_USERNAME, username);

      connectResolvedAuthRelayUrls(resolveNoasAuthRelayUrls(signInResponse));

      retryNip42RelaysAfterSignIn();
      return { success: true };
    } catch (error) {
      console.error("Noas login failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [configuredDefaultNoasHostUrl, connectResolvedAuthRelayUrls, ndk, retryNip42RelaysAfterSignIn]);

  const signupWithNoas = useCallback(async (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string }
  ): Promise<NoasAuthResult> => {
    if (!ndk) return { success: false, errorCode: "server_error" };

    const submittedNoasBaseUrl = normalizeNoasBaseUrl(config?.baseUrl || configuredDefaultNoasHostUrl || "");

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
      const signUpResponse = await noasClient.register(
        username,
        password,
        nsecKey,
        pubkey,
        buildNoasSignupOptions(
          relays
            .filter((relay) => relay.status === "connected" || relay.status === "read-only")
            .map((relay) => relay.url),
          typeof window !== "undefined" ? window.location.origin : undefined
        )
      );

      if (!signUpResponse.success || !signUpResponse.user) {
        console.error("Noas sign-up failed:", signUpResponse.error);
        setIsAuthenticating(false);
        return {
          success: false,
          errorCode: signUpResponse.errorCode || "server_error",
          errorMessage: signUpResponse.error,
          httpStatus: signUpResponse.httpStatus,
        };
      }

      if (signUpResponse.status !== "active") {
        return {
          success: false,
          registrationSucceeded: true,
          status: signUpResponse.status,
          message: signUpResponse.message,
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

      const noasUser = new NDKUser({ pubkey });
      noasUser.profile = { name: username, displayName: username, picture: `${noasApiUrl}/picture/${pubkey}` };
      setUser(noasUser);

      // Store Noas session information
      setAuthMethod("noas");
      localStorage.setItem(STORAGE_KEY_AUTH, "noas");
      localStorage.setItem(STORAGE_KEY_NOAS_USERNAME, username);
      connectResolvedAuthRelayUrls(resolveNoasAuthRelayUrls(signUpResponse));

      retryNip42RelaysAfterSignIn();
      return {
        success: true,
        registrationSucceeded: true,
        status: signUpResponse.status,
        message: signUpResponse.message,
        relays: signUpResponse.relays,
      };
    } catch (error) {
      console.error("Noas sign-up failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [configuredDefaultNoasHostUrl, connectResolvedAuthRelayUrls, ndk, relays, retryNip42RelaysAfterSignIn]);

  const getGuestPrivateKey = useCallback((): string | null => {
    if (authMethod !== "guest") return null;
    return localStorage.getItem(STORAGE_KEY_NSEC);
  }, [authMethod]);

  const publishPresenceOffline = useCallback(async (relayUrlsOverride?: string[]) => {
    if (!ndk || !ndk.signer) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = NostrEventKind.UserStatus;
      event.content = buildOfflinePresenceContent();
      event.tags = buildPresenceTags(
        Math.floor(Date.now() / 1000) + NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS
      );
      await event.sign();

      const relayUrls = resolveOfflinePresenceRelayUrls({
        relayUrlsOverride,
        registeredRelayUrls: presenceRelayUrlsRef.current,
        writableRelayUrls: resolveWritableNdkRelayUrls(relays),
      });
      if (relayUrls.length === 0) return;
      const relaySet = NDKRelaySet.fromRelayUrls(
        relayUrls,
        ndk,
        true
      );
      await event.publish(relaySet);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || "");
      const rejectionReason = extractRelayRejectionReason(error);
      if (shouldMarkRelayReadOnlyAfterPublishReject({ errorMessage, rejectionReason })) {
        const failedRelayUrls = extractRelayUrlsFromError(error);
        const relayUrlsToMark = failedRelayUrls.length > 0
          ? failedRelayUrls
          : relays.map((relay) => normalizeRelayUrl(relay.url));
        relayUrlsToMark.forEach((relayUrl) => {
          markRelayVerificationFailure(relayUrl, "write", {
            setStatus: true,
            showToast: false,
          });
        });
      }
      console.warn("Failed to publish offline presence event during logout", error);
    }
  }, [markRelayVerificationFailure, ndk, relays]);

  const setPresenceRelayUrls = useCallback((relayUrls: string[]) => {
    presenceRelayUrlsRef.current = dedupeNormalizedRelayUrls(relayUrls);
  }, []);

  const logout = useCallback(() => {
    void publishPresenceOffline();
    profileSyncRunRef.current += 1;
    setIsProfileSyncing(false);
    if (ndk) {
      ndk.signer = undefined;
    }
    setUser(null);
    setAuthMethod(null);
    relayAuthPreflightHistoryRef.current.clear();
    relaysPendingAuthSubscriptionReplayRef.current.clear();
    kind0ProfileCacheRef.current.clear();
    kind0ProfileInFlightRef.current.clear();
    kind0ProfileFailureUntilRef.current.clear();
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
    relayAuthPreflightHistoryRef.current.delete(normalized);
    relayReadRejectedRef.current.delete(normalized);
    relayWriteRejectedRef.current.delete(normalized);
    relayInfoRef.current.delete(normalized);
    relayInfoFetchedAtRef.current.delete(normalized);
    void relayStatusCacheAdapter.updateRelayStatus?.(normalized, {});
    nostrDevLog("relay", "Removing relay and disconnecting", { relayUrl: normalized });

    // Remove from NDK's explicit relay list so subscriptions stop routing to it.
    ndk.explicitRelayUrls = ndk.explicitRelayUrls?.filter((u) => normalizeRelayUrl(u) !== normalized);

    disconnectTrackedRelayInstance(ndk, normalized);
  }, [disconnectTrackedRelayInstance, ndk, relayStatusCacheAdapter]);

  const reconnectRelay = useCallback((url: string, options?: { forceNewSocket?: boolean }) => {
    if (!ndk) return;
    const normalized = normalizeRelayUrl(url);
    const relayStatus = relaysRef.current.find((entry) => normalizeRelayUrl(entry.url) === normalized)?.status;
    const reconnectAction = resolveManualRelayReconnectAction(relayStatus);
    const forceNewSocket = options?.forceNewSocket ?? false;
    removedRelaysRef.current.delete(normalized);
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAutoPausedRef.current.delete(normalized);
    pendingRelayVerificationRef.current.delete(normalized);
    relayAuthRetryHistoryRef.current.delete(normalized);
    if (reconnectAction.retryAuth && ndk.signer) {
      relayAuthPreflightHistoryRef.current.delete(normalized);
      pendingRelayVerificationRef.current.set(normalized, {
        operation: reconnectAction.verificationOperation,
        requestedAt: Date.now(),
      });
      if (reconnectAction.replaySubscriptionsAfterAuth) {
        relaysPendingAuthSubscriptionReplayRef.current.add(normalized);
      } else {
        relaysPendingAuthSubscriptionReplayRef.current.delete(normalized);
      }
    }
    nostrDevLog("relay", "Relay reconnect requested", {
      relayUrl: normalized,
      relayStatus,
      retryAuth: reconnectAction.retryAuth && Boolean(ndk.signer),
      replaySubscriptionsAfterAuth: reconnectAction.replaySubscriptionsAfterAuth && Boolean(ndk.signer),
      reconnectMode: forceNewSocket ? "hard" : "soft",
    });

    const relay = connectManagedRelay(ndk, normalized, { forceNewSocket });
    if (reconnectAction.retryAuth && ndk.signer) {
      primeRelayAuthChallenge(ndk, normalized);
    }
    const mappedStatus = mapRelayTransportStatus(relay);
    setRelays((previous) =>
      previous.map((entry) =>
        entry.url.replace(/\/+$/, "") === normalized
          ? {
              ...entry,
              status: mappedStatus === "connected"
                ? resolveConnectedRelayStatus(normalized)
                : mappedStatus,
            }
          : entry
      )
    );
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge, resolveConnectedRelayStatus]);

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

      const writableRelayUrls = resolveWritableNdkRelayUrls(relays);
      if (relayUrls && relayUrls.length > 0) {
        targetRelayUrls = filterRelayUrlsToWritableSet(relayUrls, new Set(writableRelayUrls));
      } else if (writableRelayUrls.length > 0) {
        targetRelayUrls = writableRelayUrls;
      } else {
        targetRelayUrls = dedupeNormalizedRelayUrls(resolvedDefaultRelays);
      }
      nostrDevLog("publish", "Preparing publish relay set", {
        kind,
        eventTagCount: eventTags.length,
        parentId: parentId || null,
        reason: relayUrls && relayUrls.length > 0 ? "explicit relay override" : "active relays fallback",
        targetRelayUrls,
      });
      if (targetRelayUrls.length === 0) {
        console.warn("Event publish skipped: no writable relay targets available");
        return { success: false, eventId: event.id };
      }
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
          const shouldMarkReadOnly =
            shouldMarkRelayReadOnlyAfterPublishReject({
              errorMessage: decisionErrorMessage,
              rejectionReason: extractedReason,
            }) ||
            (decisionErrorMessage !== errorMessage &&
              shouldMarkRelayReadOnlyAfterPublishReject({
                errorMessage,
                rejectionReason: extractedReason,
              }));
          if (shouldMarkReadOnly) {
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

    setUser((prev) => {
      if (!prev) return prev;
      const updated = new NDKUser({ pubkey: prev.pubkey });
      updated.profile = {
        ...prev.profile,
        name: profile.name.trim(),
        displayName: profile.displayName?.trim() || undefined,
        picture: profile.picture?.trim() || undefined,
        about: profile.about?.trim() || undefined,
        nip05: profile.nip05?.trim() || undefined,
      };
      return updated;
    });
    setNeedsProfileSetup(false);
    return true;
  }, [publishEvent, relays]);

  useEffect(() => {
    if (!user?.pubkey) {
      setNeedsProfileSetup(false);
      setIsProfileSyncing(false);
      return;
    }

    const syncRun = profileSyncRunRef.current + 1;
    profileSyncRunRef.current = syncRun;
    let cancelled = false;
    const isStale = () => cancelled || profileSyncRunRef.current !== syncRun;

    setIsProfileSyncing(true);

    const syncProfile = async () => {
      const kind0Profile = await fetchLatestKind0Profile(user.pubkey);
      if (isStale()) return;

      const mergedProfile = {
        ...(userProfileSnapshot || {}),
        ...(kind0Profile || {}),
      };

      setUser((prev) => {
        if (!prev || prev.pubkey !== user.pubkey) return prev;
        const p = prev.profile;
        const isUnchanged =
          p?.name === mergedProfile.name &&
          p?.displayName === mergedProfile.displayName &&
          p?.picture === mergedProfile.picture &&
          p?.about === mergedProfile.about &&
          p?.nip05 === mergedProfile.nip05;
        if (isUnchanged) return prev;
        const updated = new NDKUser({ pubkey: prev.pubkey });
        updated.profile = mergedProfile;
        return updated;
      });

      const hasProfile = !!(mergedProfile.name || mergedProfile.displayName || mergedProfile.picture || mergedProfile.about || mergedProfile.nip05);
      setNeedsProfileSetup(!hasProfile);
      setIsProfileSyncing(false);
    };

    void syncProfile().catch((error) => {
      if (isStale()) return;
      console.warn("Profile sync failed", error);
      const p = userProfileSnapshot;
      const hasProfile = !!(p?.name || p?.displayName || p?.picture || p?.about || p?.nip05);
      setNeedsProfileSetup(!hasProfile);
      setIsProfileSyncing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLatestKind0Profile, user?.pubkey, userProfileSnapshot]);

  const subscribe = useCallback((
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ): NDKSubscription | null => {
    if (!ndk) return null;
    const authScope = authMethodRef.current || "signed-out";
    const activeRelays = relaysRef.current;

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
      authScope,
    });

    if (ndk.signer) {
      activeRelays
        .filter((relay) => relay.nip11?.authRequired)
        .map((relay) => normalizeRelayUrl(relay.url))
        .forEach((relayUrl) => {
          primeRelayAuthChallenge(ndk, relayUrl);
        });
    }

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
      const relayFilters = subscription.relayFilters?.get(normalizedRelayUrl) ?? limitDecision.filters;
      const shouldRetry = shouldRetryAuthClosedSubscription({
        hasSigner: Boolean(ndk.signer),
        hadPendingAuthChallenge: pendingRelayVerificationRef.current.has(normalizedRelayUrl),
        lastRetryAt: relayAuthRetryHistoryRef.current.get(normalizedRelayUrl),
        now: Date.now(),
        reason: reason || "",
        filters: relayFilters,
      });
      if (shouldRetry) {
        relayAuthRetryHistoryRef.current.set(normalizedRelayUrl, Date.now());
        nostrDevLog("relay", "Retrying auth-closed relay subscription without forcing a new socket", {
          relayUrl: normalizedRelayUrl,
        });
        const managedRelay = connectManagedRelay(ndk, normalizedRelayUrl);
        managedRelay.subscribe(subscription, relayFilters);
      } else {
        relaysPendingAuthSubscriptionReplayRef.current.add(normalizedRelayUrl);
        nostrDevLog("relay", "Skipping auth-closed relay subscription retry", {
          relayUrl: normalizedRelayUrl,
          reason,
        });
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
  }, [beginRelayOperation, connectManagedRelay, endRelayOperation, markRelayReadOutcome, markRelayVerificationFailure, ndk, primeRelayAuthChallenge]);

  const isConnected = useMemo(() => {
    return relays.some((r) => r.status === "connected" || r.status === "read-only");
  }, [relays]);

  const hasWritableRelayConnection = useMemo(() => {
    return relays.some((relay) => relay.status === "connected");
  }, [relays]);

  const contextValue: NDKContextValue = useMemo(() => ({
    ndk,
    isConnected,
    hasWritableRelayConnection,
    relays,
    defaultNoasHostUrl: configuredDefaultNoasHostUrl,
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
    reorderRelays,
    removeRelay,
    reconnectRelay,
    setPresenceRelayUrls,
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
    hasWritableRelayConnection,
    relays,
    configuredDefaultNoasHostUrl,
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
    reorderRelays,
    removeRelay,
    reconnectRelay,
    setPresenceRelayUrls,
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
