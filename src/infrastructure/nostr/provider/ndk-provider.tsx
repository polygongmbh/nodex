import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import NDK, {
  NDKSubscriptionCacheUsage,
  NDKUser,
} from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { normalizeNoasBaseUrl } from "@/lib/nostr/noas-discovery";
import type { EditableNostrProfile } from "@/infrastructure/nostr/profile-metadata";
import { getConfiguredDefaultRelays } from "@/infrastructure/nostr/default-relays";
import { dedupeNormalizedRelayUrls, isRelayUrl, normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { registerMemdiagStore } from "@/lib/memdiag";
import type { AuthMethod, NDKContextValue, NDKProviderProps, NDKRelayStatus } from "./contracts";
import {
  loadPersistedNoasDefaultHostUrl,
  savePersistedRelayUrls,
  STORAGE_KEY_NSEC,
} from "./storage";
import {
  mapRelayTransportStatus,
  resolveConnectedRelayStatus,
  useRelayPool,
  type UseRelayPoolDeps,
} from "./use-relay-pool";
import { reorderResolvedRelayStatuses } from "./relay-list";
import { createRelayNip42AuthPolicy } from "@/infrastructure/nostr/nip42-relay-auth-policy";
import { ndkMetadataCacheAdapter } from "@/infrastructure/nostr/ndk-metadata-cache-adapter";
import { createNip98AuthHeader } from "@/lib/nostr/nip98-http-auth";
import { shouldReconnectRelayAfterSignIn } from "./relay-verification";
import { useRelayNip11 } from "./use-relay-nip11";
import { buildNip11Status } from "./relay-status";
import { useRelayTransport } from "./use-relay-transport";
import { useRelayVerification } from "./use-relay-verification";
import { useProfile } from "./use-profile";
import { usePresence } from "./use-presence";
import { usePublish } from "./use-publish";
import { useSubscribe } from "./use-subscribe";
import { useSession } from "./use-session";
import { useAuthActions } from "./use-auth-actions";
import { useNoas } from "./use-noas";
import {
  filterRelayUrlsToWritableSet,
  resolveWritableNdkRelayUrls,
} from "@/lib/nostr/relay-write-targets";
import { useProfileSync } from "./use-profile-sync";
import { useEnsureOwnProfile } from "./use-ensure-own-profile";
export type { AuthMethod, NDKUser, NDKRelayStatus, NDKContextValue } from "./contracts";

export const NDKContext = createContext<NDKContextValue | null>(null);
const RELAY_AUTH_PREFLIGHT_TIMEOUT_MS = 4000;
const RELAY_CONNECT_RETRY_BASE_MS = 1000;
type RelayOperation = "read" | "write" | "unknown";

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

function resolveRelayConnectRetryDelay(failureCount: number): number {
  return RELAY_CONNECT_RETRY_BASE_MS * 2 ** Math.max(failureCount - 1, 0);
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
  // Note: relay persistence is resolved upstream by the startup relay bootstrap
  // and surfaced via `defaultRelays`. The provider does not re-read persisted
  // relays itself so a single source of truth controls which relays are used.
  const resolvedDefaultRelays = configuredDefaultRelays;
  const [ndk, setNdk] = useState<NDK | null>(null);
  const ndkRef = useRef<NDK | null>(null);
  useEffect(() => { ndkRef.current = ndk; }, [ndk]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    registerMemdiagStore("ndk", () => {
      const instance = ndkRef.current as unknown as {
        subManager?: { subscriptions?: Map<unknown, unknown> };
        pool?: { relays?: Map<unknown, unknown> };
      } | null;
      const subs = instance?.subManager?.subscriptions;
      const relays = instance?.pool?.relays;
      return {
        size: subs?.size ?? 0,
        extras: {
          relays: relays?.size ?? 0,
          hasInstance: instance ? 1 : 0,
        },
      };
    });
  }, []);
  const [user, setUser] = useState<NDKUser | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const {
    isSessionLocked,
    setIsSessionLocked,
    lockedNoasUsername,
    setLockedNoasUsername,
    lockedNoasKeyRef,
    sessionPasswordHashRef,
    applyAuthenticatedState,
    clearTransientAuthState,
    persistNoasSession,
    createRestoreSession,
    clearLockedSession,
  } = useSession({ setUser, setAuthMethod });
  const poolDepsRef = useRef<UseRelayPoolDeps>({} as UseRelayPoolDeps);
  const {
    relays,
    setRelays,
    relaysRef,
    removedRelaysRef,
    updateRelayEntry,
    attachPoolHandlers,
    reconcileRelayStatusesFromPool,
    resetRejectedRelayStatuses,
  } = useRelayPool(poolDepsRef);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const profileSyncRunRef = useRef(0);
  const relayConnectFailureCountsRef = useRef<Map<string, number>>(new Map());
  const relayConnectedOnceRef = useRef<Set<string>>(new Set());
  const connectResolvedAuthRelayUrlsRef = useRef<(relayUrls: string[]) => void>(() => undefined);
  const {
    relayDocumentRef,
    probeRelayInfo,
    hydrateStartupCache,
    clearRelayInfo,
  } = useRelayNip11({ updateRelayEntry });
  const relayTimeoutIdsRef = useRef<Set<number>>(new Set());
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
    clearAllRelayConnectWatchdogIdsRef.current();
  }, []);
  const clearAllRelayConnectWatchdogIdsRef = useRef<() => void>(() => undefined);

  const primeAuthRef = useRef<(ndkInstance: NDK, relayUrl: string) => void>(() => undefined);
  const primeRelayAuthChallenge = useCallback((ndkInstance: NDK, relayUrl: string) => {
    primeAuthRef.current(ndkInstance, relayUrl);
  }, []);

  const {
    connectManagedRelay,
    disconnectTrackedRelayInstance,
    scheduleRelayConnectWatchdog,
    clearRelayConnectWatchdog,
    clearAllRelayConnectWatchdogIds,
  } = useRelayTransport({
    removedRelaysRef,
    scheduleRelayTimeout,
    clearTrackedRelayTimeout,
  });
  clearAllRelayConnectWatchdogIdsRef.current = clearAllRelayConnectWatchdogIds;

  const {
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
    clearVerificationStateOnLogout,
    updateRelayCapabilityStatus,
    markRelayVerificationSuccess,
    markRelayVerificationFailure,
    attachRelayOkRejectObserver,
    detachRelayOkRejectObserver,
    notifyRelayVerificationEvent,
    beginRelayOperation,
    endRelayOperation,
    tryRecordAuthPreflight,
    forgetAuthPreflight,
    clearAuthSessionState,
  } = useRelayVerification({
    updateRelayEntry,
    relayDocumentRef,
    authMethodRef,
  });

  primeAuthRef.current = (ndkInstance: NDK, relayUrl: string) => {
    if (!ndkInstance.signer) return;
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!tryRecordAuthPreflight(normalizedRelayUrl)) return;

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
  };

  const {
    kind0ProfileInFlightRef,
    fetchLatestKind0Profile,
    clearKind0Caches,
    clearKind0CachesForResignIn,
  } = useProfile({
    ndk,
    beginRelayOperation,
    endRelayOperation,
    scheduleRelayTimeout,
    clearTrackedRelayTimeout,
  });

  const replayActiveSubscriptionsForRelay = useCallback((ndkInstance: NDK, relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const relay = ndkInstance.pool.relays.get(normalizedRelayUrl);
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
      nostrDevLog("relay", "Replayed active subscriptions for relay", {
        relayUrl: normalizedRelayUrl,
        replayedSubscriptions,
      });
    }
  }, []);

  const retryNip42RelaysAfterSignIn = useCallback(() => {
    if (!ndk) return;
    // Flush kind-0 profile request cache so post-sign-in auth can rehydrate profile metadata immediately.
    clearKind0CachesForResignIn();

    // Use relaysRef so this function is stable and safe to call from async contexts
    // (e.g. session restore) without capturing a stale relays snapshot.
    const currentRelays = relaysRef.current;
    let touchedRelay = false;
    let hasReconnectRelay = false;

    currentRelays.forEach((relay) => {
      const relayUrl = normalizeRelayUrl(relay.url);
      const needsReconnect = shouldReconnectRelayAfterSignIn(relay);
      const shouldPrimeAuth = needsReconnect || Boolean(relay.nip11?.supportsNip42 || relay.nip11?.authRequired);

      if (!needsReconnect && !shouldPrimeAuth) {
        return;
      }

      touchedRelay = true;
      if (needsReconnect) {
        hasReconnectRelay = true;
      }
      if (needsReconnect) {
        relayConnectFailureCountsRef.current.delete(relayUrl);
        relayAuthRetryHistoryRef.current.delete(relayUrl);
        pendingRelayVerificationRef.current.delete(relayUrl);
      }
      if (shouldPrimeAuth) {
        // Force a fresh auth challenge pass immediately after sign-in.
        forgetAuthPreflight(relayUrl);
      }
      // Only force a new socket for relays that need reconnecting. Healthy connected relays
      // can receive a fresh NIP-42 challenge on the existing socket via primeRelayAuthChallenge;
      // their existing subs already registered once("authed", reExecuteAfterAuth) inside NDK,
      // so they re-issue automatically when the new auth round succeeds.
      connectManagedRelay(ndk, relayUrl, {
        forceNewSocket: needsReconnect,
      });
      if (needsReconnect) {
        // Fresh NDKRelay instance has no subs; attach the active ones explicitly.
        // NDK will queue them until the new socket is ready and (for NIP-42) authed.
        replayActiveSubscriptionsForRelay(ndk, relayUrl);
      }
      if (shouldPrimeAuth) {
        primeRelayAuthChallenge(ndk, relayUrl);
      }
    });

    if (!touchedRelay) return;

    if (hasReconnectRelay) {
      setRelays((previous) =>
        previous.map((relay) =>
          shouldReconnectRelayAfterSignIn(relay)
            ? { ...relay, status: "connecting" }
            : relay
        )
      );
    }

    nostrDevLog("relay", "Refreshing relay auth state after sign in", {
      hasReconnectRelay,
    });
    // Intentionally omits stable refs and setters; adding callbacks here would
    // recreate this handler whenever upstream identities churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge, replayActiveSubscriptionsForRelay]);

  // Sync pool-hook deps every render so attach-time handlers see latest callbacks.
  poolDepsRef.current = {
    scheduleRelayConnectWatchdog,
    clearRelayConnectWatchdog,
    attachRelayOkRejectObserver,
    detachRelayOkRejectObserver,
    primeRelayAuthChallenge,
    markRelayVerificationSuccess,
    updateRelayCapabilityStatus,
    scheduleRelayTimeout,
    resolveRelayConnectRetryDelay,
    relayDocumentRef,
    relayConnectFailureCountsRef,
    relayConnectedOnceRef,
    pendingRelayVerificationRef,
  };

  // Initialize NDK
  useEffect(() => {
    nostrDevLog("provider", "Initializing NDK provider", {
      configuredDefaultRelays: resolvedDefaultRelays,
    });
    // The cache adapter handles only NIP-11 / NIP-05 metadata. Event caching
    // lives in our own persisted posts cache (posts-cache.ts) because we want
    // per-relay attribution preserved across hydration, which NDK's event
    // cache adapters don't carry.
    const ndkInstance = new NDK({
      explicitRelayUrls: resolvedDefaultRelays,
      cacheAdapter: ndkMetadataCacheAdapter,
      // NDK defaults to true: on signer set, it fetches the user's kind 3 / 10002 and
      // silently connects to every relay listed there, bypassing our relay-state tracking.
      autoConnectUserRelays: false,
      // NDK otherwise spins up an "outbox pool" hardwired to purplepag.es / nos.lol
      // (DEFAULT_OUTBOX_RELAYS) and connects it on ndk.connect(), even when signed out.
      enableOutboxModel: false,
    });

    ndkInstance.relayAuthDefaultPolicy = createRelayNip42AuthPolicy(ndkInstance, notifyRelayVerificationEvent);

    attachPoolHandlers(ndkInstance);

    // Initialize relay states
    removedRelaysRef.current.clear();
    hydrateStartupCache(resolvedDefaultRelays);
    setRelays(resolvedDefaultRelays.map((url) => {
      const normalizedUrl = normalizeRelayUrl(url);
      const document = relayDocumentRef.current.get(normalizedUrl);
      return {
        url: normalizedUrl,
        status: "connecting",
        nip11: document ? buildNip11Status(document) : undefined,
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
    const session = createRestoreSession(ndkInstance, (relayUrls) =>
      connectResolvedAuthRelayUrlsRef.current(relayUrls)
    );

    void ndkInstance.connect();
    nostrDevLog("relay", "Initial NDK connect() dispatched", {
      pooledRelayCount: ndkInstance.pool.relays.size,
      explicitRelayUrls: ndkInstance.explicitRelayUrls,
    });
    void session.restore();
    const inFlightKind0ProfileRequests = kind0ProfileInFlightRef.current;

    return () => {
      session.abort();
      clearAllTrackedRelayTimeouts();
      ndkInstance.pool.removeAllListeners();
      ndkInstance.pool.relays.forEach((relay) => {
        relay.disconnect();
      });
      inFlightKind0ProfileRequests.clear();
    };
    // Init-only effect: omits refs and setRelays intentionally — they are stable
    // and re-running this would tear down NDK and reconnect every relay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachPoolHandlers, clearAllTrackedRelayTimeouts, createRestoreSession, hydrateStartupCache, notifyRelayVerificationEvent, probeRelayInfo, resolvedDefaultRelays]);

  const addRelay = useCallback((url: string) => {
    if (!ndk) return;

    if (!isRelayUrl(url)) {
      console.error("Invalid relay URL");
      return;
    }
    const normalized = normalizeRelayUrl(url);
    removedRelaysRef.current.delete(normalized);
    relayConnectFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    nostrDevLog("relay", "Adding relay and initiating connection", { relayUrl: normalized });
    void probeRelayInfo(normalized);

    // Keep NDK's explicit relay list in sync so subscription routing includes this relay.
    // NDK's pool monitor watches explicitRelayUrls; re-assigning the property nudges NDK
    // to re-drive connect() against every URL in the list, opening fresh sockets for
    // every relay we already have connected. Mutate in place to avoid that.
    if (!ndk.explicitRelayUrls) {
      ndk.explicitRelayUrls = [];
    }
    if (!ndk.explicitRelayUrls.some((entry) => normalizeRelayUrl(entry) === normalized)) {
      ndk.explicitRelayUrls.push(normalized);
    }

    // Add to relays state
    setRelays((prev) => {
      let next: NDKRelayStatus[];
      if (prev.some((r) => r.url === normalized)) {
        next = prev.map((r) =>
          r.url === normalized ? { ...r, status: "connecting" } : r
        );
        savePersistedRelayUrls(next.map((relay) => relay.url));
        return next;
      }
      const document = relayDocumentRef.current.get(normalized);
      next = [...prev, {
        url: normalized,
        status: "connecting",
        nip11: document ? buildNip11Status(document) : undefined,
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

    // Active subs were registered with NDK's sub-manager before this relay joined the pool,
    // so NDK won't add the new NDKRelay to existing per-relay sub records. Attach them now;
    // NDK queues them until the socket is ready (and, for NIP-42, until authed).
    replayActiveSubscriptionsForRelay(ndk, normalized);
    if (ndk.signer) {
      primeRelayAuthChallenge(ndk, normalized);
    }
    // Stable refs and setRelays intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge, probeRelayInfo, replayActiveSubscriptionsForRelay]);

  const connectResolvedAuthRelayUrls = useCallback((relayUrls: string[]) => {
    relayUrls
      .forEach((relayUrl) => {
        addRelay(relayUrl);
      });
  }, [addRelay]);
  connectResolvedAuthRelayUrlsRef.current = connectResolvedAuthRelayUrls;

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

      const nextRelayUrls = dedupeNormalizedRelayUrls(next.map((relay) => relay.url));
      // Mutate in place (see addRelay) so NDK's pool monitor doesn't reconnect everything.
      if (!ndk.explicitRelayUrls) {
        ndk.explicitRelayUrls = [];
      }
      ndk.explicitRelayUrls.length = 0;
      ndk.explicitRelayUrls.push(...nextRelayUrls);
      savePersistedRelayUrls(nextRelayUrls);
      nostrDevLog("relay", "Relay order updated", { relayUrls: nextRelayUrls });
      return next;
    });
    // setRelays is stable; intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndk]);

  const {
    loginWithNoas,
    signupWithNoas,
    updateNoasProfilePicture,
    unlockNoasSession,
  } = useNoas({
    ndk,
    authMethod,
    user,
    relays,
    configuredDefaultNoasHostUrl,
    applyAuthenticatedState,
    clearTransientAuthState,
    persistNoasSession,
    connectResolvedAuthRelayUrls,
    retryNip42RelaysAfterSignIn,
    setIsAuthenticating,
    setIsSessionLocked,
    setLockedNoasUsername,
    lockedNoasKeyRef,
    sessionPasswordHashRef,
  });

  const getGuestPrivateKey = useCallback((): string | null => {
    if (authMethod !== "guest") return null;
    return localStorage.getItem(STORAGE_KEY_NSEC);
  }, [authMethod]);

  const { setPresenceRelayUrls, publishPresenceOffline } = usePresence({
    ndk,
    relays,
    markRelayVerificationFailure,
  });

  const {
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    logout,
  } = useAuthActions({
    ndk,
    applyAuthenticatedState,
    clearTransientAuthState,
    fetchLatestKind0Profile,
    retryNip42RelaysAfterSignIn,
    setUser,
    setAuthMethod,
    setIsAuthenticating,
    setIsProfileSyncing,
    publishPresenceOffline,
    profileSyncRunRef,
    resetAuthSessionRefs: clearAuthSessionState,
    clearVerificationStateOnLogout,
    resetRejectedRelayStatuses,
    clearKind0Caches,
    clearLockedSession,
  });



  const removeRelay = useCallback((url: string) => {
    if (!ndk) return;

    const normalized = normalizeRelayUrl(url);

    // Mark as intentionally removed so disconnect events don't re-add it
    removedRelaysRef.current.add(normalized);
    setRelays((prev) => {
      const next = prev.filter((r) => r.url !== normalized);
      savePersistedRelayUrls(next.map((relay) => relay.url));
      return next;
    });
    relayConnectFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    forgetAuthPreflight(normalized);
    clearRelayInfo(normalized);
    nostrDevLog("relay", "Removing relay and disconnecting", { relayUrl: normalized });

    // Remove from NDK's explicit relay list so subscriptions stop routing to it.
    // Mutate in place (see addRelay) to avoid NDK reconnecting every relay in the list.
    const explicit = ndk.explicitRelayUrls;
    if (explicit) {
      for (let i = explicit.length - 1; i >= 0; i -= 1) {
        if (normalizeRelayUrl(explicit[i]) === normalized) explicit.splice(i, 1);
      }
    }

    disconnectTrackedRelayInstance(ndk, normalized);
    // Stable refs and setRelays intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearRelayInfo, disconnectTrackedRelayInstance, ndk]);

  const reconnectRelay = useCallback((url: string, options?: { forceNewSocket?: boolean }) => {
    if (!ndk) return;
    const normalized = normalizeRelayUrl(url);
    const relayStatus = relaysRef.current.find((entry) => entry.url === normalized)?.status;
    const forceNewSocket = (options?.forceNewSocket ?? false) || relayStatus === "connecting";
    removedRelaysRef.current.delete(normalized);
    pendingRelayVerificationRef.current.delete(normalized);
    relayAuthRetryHistoryRef.current.delete(normalized);
    if (forceNewSocket) {
      relayConnectFailureCountsRef.current.delete(normalized);
      relayConnectedOnceRef.current.delete(normalized);
    }
    if (ndk.signer) {
      forgetAuthPreflight(normalized);
      pendingRelayVerificationRef.current.set(normalized, {
        operation: relayStatus === "read-only" ? "write" : "read",
        requestedAt: Date.now(),
      });
    }
    nostrDevLog("relay", "Relay reconnect requested", {
      relayUrl: normalized,
      relayStatus,
      retryAuth: Boolean(ndk.signer),
      reconnectMode: forceNewSocket ? "hard" : "soft",
    });

    const relay = connectManagedRelay(ndk, normalized, { forceNewSocket });
    if (forceNewSocket) {
      // Fresh NDKRelay has no subs; re-attach active ones. Soft reconnects reuse
      // the existing instance which still holds its subs.
      replayActiveSubscriptionsForRelay(ndk, normalized);
    }
    if (ndk.signer) {
      primeRelayAuthChallenge(ndk, normalized);
    }
    const mappedStatus = mapRelayTransportStatus(relay);
    updateRelayEntry(normalized, (relayEntry) => {
      const nextStatus = mappedStatus === "connected"
        ? resolveConnectedRelayStatus(relayEntry.status)
        : mappedStatus;
      return relayEntry.status === nextStatus ? relayEntry : { ...relayEntry, status: nextStatus };
    });
    // Stable refs intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge, replayActiveSubscriptionsForRelay, resolveConnectedRelayStatus, updateRelayEntry]);

  // Periodic + visibility-triggered reconciliation of React relay state against
  // NDK's pool. Catches two divergence sources nothing else fixes uniformly:
  //   1. Missed `relay:connect` — pool is CONNECTED but React shows connecting,
  //      typically when session restore replaces the pool relay between the
  //      relay:connecting and relay:connect dispatches (handleRelayConnect
  //      bails on its replaced-instance guard).
  //   2. Stuck-on-CONNECTING — pool isn't progressing but no relay:disconnect
  //      ever reached our handler. Force a fresh socket.
  //
  // Wake-from-sleep is handled by NDK's own 15s sleep detector plus the
  // per-relay backoff in onRelayDisconnect; this heartbeat does not need
  // to special-case it.
  useEffect(() => {
    if (!ndk) return;
    const reconcile = () => {
      const { driftCorrections, stuckOnTransport } = reconcileRelayStatusesFromPool(ndk);
      if (driftCorrections > 0 || stuckOnTransport.length > 0) {
        nostrDevLog("relay", "Reconciling relay state", { driftCorrections, stuckOnTransport });
      }
      stuckOnTransport.forEach((relayUrl) => {
        reconnectRelay(relayUrl, { forceNewSocket: true });
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      reconcile();
    };

    const HEARTBEAT_MS = 10000;
    const heartbeatId = window.setInterval(reconcile, HEARTBEAT_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", reconcile);
    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", reconcile);
    };
  }, [ndk, reconcileRelayStatusesFromPool, reconnectRelay]);

  const { publishEvent, signEvent, broadcastSignedEvent } = usePublish({
    ndk,
    relays,
    resolvedDefaultRelays,
    beginRelayOperation,
    endRelayOperation,
    markRelayVerificationFailure,
    updateRelayCapabilityStatus,
  });

  const createHttpAuthHeader = useCallback(async (
    url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  ): Promise<string | null> => {
    return createNip98AuthHeader(ndk, url, method);
  }, [ndk]);

  const { updateUserProfile } = useProfileSync(
    ndk,
    user,
    relays,
    publishEvent,
    fetchLatestKind0Profile,
    profileSyncRunRef,
    setUser,
    setNeedsProfileSetup,
    setIsProfileSyncing,
  );

  useEnsureOwnProfile(user, authMethod, relays, publishEvent, fetchLatestKind0Profile);

  const { subscribe } = useSubscribe({
    ndk,
    relaysRef,
    authMethodRef,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
    beginRelayOperation,
    endRelayOperation,
    markRelayVerificationFailure,
    updateRelayCapabilityStatus,
    primeRelayAuthChallenge,
    connectManagedRelay,
  });

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
    signEvent,
    broadcastSignedEvent,
    createHttpAuthHeader,
    updateUserProfile,
    needsProfileSetup,
    isProfileSyncing,
    subscribe,
    getGuestPrivateKey,
    updateNoasProfilePicture,
    isSessionLocked,
    lockedNoasUsername,
    unlockNoasSession,
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
    signEvent,
    broadcastSignedEvent,
    createHttpAuthHeader,
    updateUserProfile,
    needsProfileSetup,
    isProfileSyncing,
    subscribe,
    getGuestPrivateKey,
    updateNoasProfilePicture,
    isSessionLocked,
    lockedNoasUsername,
    unlockNoasSession,
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
