import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import NDK, {
  NDKSubscriptionCacheUsage,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKUser,
} from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { NoasClient, hashNoasPassword, type NoasAuthResult } from "@/lib/nostr/noas-client";
import { isValidNoasBaseUrl, normalizeNoasBaseUrl, resolveNoasApiBaseUrl } from "@/lib/nostr/noas-discovery";
import { privateKeyHexToNsec } from "@/lib/nostr/nip49-utils";
import type { EditableNostrProfile } from "@/infrastructure/nostr/profile-metadata";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { buildDeterministicGuestName } from "@/lib/guest-name";
import { getConfiguredDefaultRelays } from "@/infrastructure/nostr/default-relays";
import { dedupeNormalizedRelayUrls, isRelayUrl, normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { AuthMethod, NDKContextValue, NDKProviderProps, NDKRelayStatus } from "./contracts";
import { seedNostrProfile } from "@/infrastructure/nostr/use-nostr-profiles";
import {
  clearSessionNoasState,
  clearSessionPrivateKey,
  clearStoredAuthMethod,
  hasNostrExtension,
  loadSessionNoasState,
  loadPersistedNoasDefaultHostUrl,
  savePersistentAuthMethod,
  savePersistedRelayUrls,
  saveSessionAuthMethod,
  saveSessionPrivateKey,
  STORAGE_KEY_NIP46_BUNKER,
  STORAGE_KEY_NIP46_LOCAL_NSEC,
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
import { createNip98AuthHeader } from "@/lib/nostr/nip98-http-auth";
import {
  AUTH_RETRY_COOLDOWN_MS,
  shouldReconnectRelayAfterSignIn,
} from "./relay-verification";
import { useRelayNip11 } from "./use-relay-nip11";
import { useRelayTransport } from "./use-relay-transport";
import { useRelayVerification } from "./use-relay-verification";
import { useProfile } from "./use-profile";
import { usePresence } from "./use-presence";
import { usePublish } from "./use-publish";
import { useSubscribe } from "./use-subscribe";
import { useSession, showLoginSuccessToast, profileFromCachedKind0 } from "./use-session";
import { useAuthActions } from "./use-auth-actions";
import { buildNoasSignupOptions, resolveNoasAuthRelayUrls } from "@/infrastructure/nostr/noas-auth-helpers";
import {
  filterRelayUrlsToWritableSet,
  resolveWritableNdkRelayUrls,
} from "@/lib/nostr/relay-write-targets";
import { useProfileSync } from "./use-profile-sync";
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

function updateExplicitRelayUrlsInPlace(ndkInstance: NDK, relayUrls: string[]): void {
  const nextRelayUrls = dedupeNormalizedRelayUrls(relayUrls);
  const explicitRelayUrls = ndkInstance.explicitRelayUrls;
  if (Array.isArray(explicitRelayUrls)) {
    explicitRelayUrls.splice(0, explicitRelayUrls.length, ...nextRelayUrls);
    return;
  }
  (ndkInstance as unknown as { explicitRelayUrls: string[] }).explicitRelayUrls = nextRelayUrls;
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
    resetRejectedRelayStatuses,
  } = useRelayPool(poolDepsRef);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const profileSyncRunRef = useRef(0);
  const relayInitialFailureCountsRef = useRef<Map<string, number>>(new Map());
  const relayConnectedOnceRef = useRef<Set<string>>(new Set());
  const connectResolvedAuthRelayUrlsRef = useRef<(relayUrls: string[]) => void>(() => undefined);
  const relayAuthPreflightHistoryRef = useRef<Map<string, number>>(new Map());
  const {
    relayInfoRef,
    relayInfoFetchedAtRef,
    relayStatusCacheAdapter,
    probeRelayInfo,
    hydrateStartupCache,
    clearRelayInfo,
  } = useRelayNip11({ updateRelayEntry });
  const relayTimeoutIdsRef = useRef<Set<number>>(new Set());
  const relaysPendingAuthSubscriptionReplayRef = useRef<Set<string>>(new Set());
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

  // Stable wrappers over verification.detachRelayOkRejectObserver — set
  // after the verification hook returns, so transport (declared later) can
  // hold stable references to functions that resolve at call time.
  const okDetachRef = useRef<(url: string) => void>(() => undefined);
  const detachRelayOkRejectObserver = useCallback((url: string) => {
    okDetachRef.current(url);
  }, []);

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

  const {
    relayCurrentInstanceRef,
    connectManagedRelay,
    disconnectTrackedRelayInstance,
    scheduleRelayConnectWatchdog,
    clearRelayConnectWatchdog,
    clearAllRelayConnectWatchdogIds,
  } = useRelayTransport({
    removedRelaysRef,
    relayInitialFailureCountsRef,
    detachRelayOkRejectObserver,
    scheduleRelayTimeout,
    clearTrackedRelayTimeout,
    setRelays,
    resolveRelayConnectRetryDelay,
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
    detachRelayOkRejectObserver: realDetachRelayOkRejectObserver,
    detachAllRelayOkRejectObservers,
    notifyRelayVerificationEvent,
    beginRelayOperation,
    endRelayOperation,
  } = useRelayVerification({
    updateRelayEntry,
    relayInfoRef,
    relayCurrentInstanceRef,
    authMethodRef,
  });
  okDetachRef.current = realDetachRelayOkRejectObserver;

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
      relaysPendingAuthSubscriptionReplayRef.current.add(relayUrl);
      if (needsReconnect) {
        relayInitialFailureCountsRef.current.delete(relayUrl);
        relayAuthRetryHistoryRef.current.delete(relayUrl);
        pendingRelayVerificationRef.current.delete(relayUrl);
      }
      if (shouldPrimeAuth) {
        // Force a fresh auth challenge pass immediately after sign-in.
        relayAuthPreflightHistoryRef.current.delete(relayUrl);
      }
      // Only force a new socket for relays that need reconnecting. Healthy connected relays
      // can receive a fresh NIP-42 challenge on the existing socket via primeRelayAuthChallenge.
      connectManagedRelay(ndk, relayUrl, {
        forceNewSocket: needsReconnect,
      });
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
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge]);

  // Sync pool-hook deps every render so attach-time handlers see latest callbacks.
  poolDepsRef.current = {
    scheduleRelayConnectWatchdog,
    clearRelayConnectWatchdog,
    attachRelayOkRejectObserver,
    detachRelayOkRejectObserver,
    primeRelayAuthChallenge,
    markRelayVerificationSuccess,
    updateRelayCapabilityStatus,
    replayActiveSubscriptionsForRelay,
    scheduleRelayTimeout,
    resolveRelayConnectRetryDelay,
    relayCurrentInstanceRef,
    relayInfoRef,
    relayInfoFetchedAtRef,
    relayInitialFailureCountsRef,
    relayConnectedOnceRef,
    pendingRelayVerificationRef,
    relaysPendingAuthSubscriptionReplayRef,
  };

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

    attachPoolHandlers(ndkInstance);

    // Initialize relay states
    removedRelaysRef.current.clear();
    relayCurrentInstanceRef.current.clear();
    hydrateStartupCache(resolvedDefaultRelays);
    setRelays(resolvedDefaultRelays.map((url) => {
      const normalizedUrl = normalizeRelayUrl(url);
      const info = relayInfoRef.current.get(normalizedUrl);
      const checkedAt = relayInfoFetchedAtRef.current.get(normalizedUrl);
      return {
        url: normalizedUrl,
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
    const session = createRestoreSession(ndkInstance, (relayUrls) =>
      connectResolvedAuthRelayUrlsRef.current(relayUrls)
    );

    void ndkInstance.connect();
    void session.restore();
    const relayCurrentInstance = relayCurrentInstanceRef.current;
    const inFlightKind0ProfileRequests = kind0ProfileInFlightRef.current;

    return () => {
      session.abort();
      clearAllTrackedRelayTimeouts();
      detachAllRelayOkRejectObservers();
      ndkInstance.pool.removeAllListeners();
      ndkInstance.pool.relays.forEach((relay) => {
        relay.disconnect();
      });
      inFlightKind0ProfileRequests.clear();
      relayCurrentInstance.clear();
    };
  }, [attachPoolHandlers, clearAllTrackedRelayTimeouts, createRestoreSession, detachAllRelayOkRejectObservers, hydrateStartupCache, notifyRelayVerificationEvent, probeRelayInfo, relayStatusCacheAdapter, resolvedDefaultRelays]);

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
    nostrDevLog("relay", "Adding relay and initiating connection", { relayUrl: normalized });
    void probeRelayInfo(normalized);

    // Keep NDK's explicit relay list in sync so subscription routing includes this relay.
    // NDK's pool monitor uses explicitRelayUrls to decide whether to send REQ to newly
    // connected relays for existing subscriptions.
    if (!ndk.explicitRelayUrls?.some((entry) => normalizeRelayUrl(entry) === normalized)) {
      updateExplicitRelayUrlsInPlace(ndk, [...(ndk.explicitRelayUrls || []), normalized]);
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

      const nextRelayUrls = next.map((relay) => relay.url);
      updateExplicitRelayUrlsInPlace(ndk, nextRelayUrls);
      savePersistedRelayUrls(nextRelayUrls);
      nostrDevLog("relay", "Relay order updated", { relayUrls: nextRelayUrls });
      return next;
    });
  }, [ndk]);

  const loginWithNoas = useCallback(async (
    username: string,
    password: string,
    config?: { baseUrl?: string; trustBrowser?: boolean }
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
      const trustBrowser = config?.trustBrowser ?? false;
      const passwordHash = hashNoasPassword(password);
      sessionPasswordHashRef.current = passwordHash;
      const noasRelayUrls = resolveNoasAuthRelayUrls(signInResponse);
      ndkUser.profile = {
        name: username,
        displayName: username,
        picture: `${noasApiUrl}/picture/${ndkUser.pubkey}`,
      };
      applyAuthenticatedState(ndk, signer, ndkUser, "noas");
      clearTransientAuthState();
      persistNoasSession({
        privateKey: trustBrowser
          ? (signer.privateKey || privateKeyHexToNsec(decryptedPrivateKey))
          : signInResponse.encryptedPrivateKey,
        apiBaseUrl: noasApiUrl,
        username,
        passwordHash: trustBrowser ? passwordHash : undefined,
        relayUrls: noasRelayUrls,
      });
      connectResolvedAuthRelayUrls(noasRelayUrls);
      retryNip42RelaysAfterSignIn();
      showLoginSuccessToast({
        authMethod: "noas",
        noasUsername: username,
        noasApiBaseUrl: noasApiUrl,
        noasMode: "signin",
      });
      return { success: true };
    } catch (error) {
      console.error("Noas login failed:", error);
      return { success: false, errorCode: "connection_failed" };
    } finally {
      setIsAuthenticating(false);
    }
  }, [applyAuthenticatedState, clearTransientAuthState, configuredDefaultNoasHostUrl, connectResolvedAuthRelayUrls, ndk, persistNoasSession, retryNip42RelaysAfterSignIn]);

  const signupWithNoas = useCallback(async (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string; email?: string }
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
        {
          ...buildNoasSignupOptions(
            relays
              .filter((relay) => relay.status === "connected" || relay.status === "read-only")
              .map((relay) => relay.url),
            typeof window !== "undefined" ? window.location.origin : undefined
          ),
          email: config?.email,
        }
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
      const noasRelayUrls = resolveNoasAuthRelayUrls(signUpResponse);
      noasUser.profile = {
        name: username,
        displayName: username,
        picture: `${noasApiUrl}/picture/${pubkey}`,
      };
      applyAuthenticatedState(ndk, signer, noasUser, "noas");
      clearTransientAuthState();
      persistNoasSession({
        privateKey: nsecKey,
        apiBaseUrl: noasApiUrl,
        username,
        passwordHash: hashNoasPassword(password),
        relayUrls: noasRelayUrls,
      });
      connectResolvedAuthRelayUrls(noasRelayUrls);
      retryNip42RelaysAfterSignIn();
      showLoginSuccessToast({
        authMethod: "noas",
        noasUsername: username,
        noasApiBaseUrl: noasApiUrl,
        noasMode: "signup",
      });
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
  }, [applyAuthenticatedState, clearTransientAuthState, configuredDefaultNoasHostUrl, connectResolvedAuthRelayUrls, ndk, persistNoasSession, relays, retryNip42RelaysAfterSignIn]);

  const getGuestPrivateKey = useCallback((): string | null => {
    if (authMethod !== "guest") return null;
    return localStorage.getItem(STORAGE_KEY_NSEC);
  }, [authMethod]);

  const updateNoasProfilePicture = useCallback(async (file: File): Promise<string | null> => {
    if (authMethod !== "noas" || !user) return null;

    const noasSession = loadSessionNoasState();
    const passwordHash = sessionPasswordHashRef.current || noasSession?.passwordHash;
    if (!passwordHash || !noasSession) return null;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          if (!base64Data) { reject(new Error('Failed to read file as base64')); return; }
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
      });

      const noasClient = new NoasClient(noasSession.apiBaseUrl);
      const result = await noasClient.updateProfilePicture(
        noasSession.username,
        passwordHash,
        base64,
        file.type || 'image/png'
      );

      if (!result.success) {
        console.warn("Failed to update Noas profile picture:", result.error);
        return null;
      }

      return `${noasSession.apiBaseUrl}/picture/${user.pubkey}?t=${Date.now()}`;
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      return null;
    }
  }, [authMethod, user]);

  const unlockNoasSession = useCallback(async (password: string): Promise<boolean> => {
    const encryptedKey = lockedNoasKeyRef.current;
    if (!encryptedKey || !ndk) return false;

    const noasSession = loadSessionNoasState();
    if (!noasSession) return false;

    try {
      const noasClient = new NoasClient(noasSession.apiBaseUrl);
      const decryptedKey = await noasClient.decryptPrivateKey(encryptedKey, password);
      const nsecKey = privateKeyHexToNsec(decryptedKey);
      const signer = new NDKPrivateKeySigner(nsecKey);
      const ndkUser = await signer.user();

      ndkUser.profile = {
        name: noasSession.username,
        displayName: noasSession.username,
        picture: `${noasSession.apiBaseUrl}/picture/${ndkUser.pubkey}`,
      };

      applyAuthenticatedState(ndk, signer, ndkUser, "noas");
      sessionPasswordHashRef.current = hashNoasPassword(password);
      setIsSessionLocked(false);
      setLockedNoasUsername(null);
      lockedNoasKeyRef.current = null;

      connectResolvedAuthRelayUrls(noasSession.relayUrls || []);
      retryNip42RelaysAfterSignIn();

      return true;
    } catch (error) {
      console.error("Failed to unlock Noas session:", error);
      return false;
    }
  }, [ndk, applyAuthenticatedState, connectResolvedAuthRelayUrls, retryNip42RelaysAfterSignIn]);

  const { setPresenceRelayUrls, publishPresenceOffline } = usePresence({
    ndk,
    relays,
    markRelayVerificationFailure,
  });

  const resetAuthSessionRefs = useCallback(() => {
    relayAuthPreflightHistoryRef.current.clear();
    relaysPendingAuthSubscriptionReplayRef.current.clear();
  }, []);

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
    resetAuthSessionRefs,
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
      const next = prev.filter((r) => normalizeRelayUrl(r.url) !== normalized);
      savePersistedRelayUrls(next.map((relay) => relay.url));
      return next;
    });
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAuthPreflightHistoryRef.current.delete(normalized);
    clearRelayInfo(normalized);
    nostrDevLog("relay", "Removing relay and disconnecting", { relayUrl: normalized });

    // Remove from NDK's explicit relay list so subscriptions stop routing to it.
    updateExplicitRelayUrlsInPlace(
      ndk,
      (ndk.explicitRelayUrls || []).filter((u) => normalizeRelayUrl(u) !== normalized)
    );

    disconnectTrackedRelayInstance(ndk, normalized);
  }, [clearRelayInfo, disconnectTrackedRelayInstance, ndk]);

  const reconnectRelay = useCallback((url: string, options?: { forceNewSocket?: boolean }) => {
    if (!ndk) return;
    const normalized = normalizeRelayUrl(url);
    const relayStatus = relaysRef.current.find((entry) => normalizeRelayUrl(entry.url) === normalized)?.status;
    const forceNewSocket = (options?.forceNewSocket ?? false) || relayStatus === "connecting";
    removedRelaysRef.current.delete(normalized);
    pendingRelayVerificationRef.current.delete(normalized);
    relayAuthRetryHistoryRef.current.delete(normalized);
    if (forceNewSocket) {
      relayInitialFailureCountsRef.current.delete(normalized);
      relayConnectedOnceRef.current.delete(normalized);
    }
    if (ndk.signer) {
      relayAuthPreflightHistoryRef.current.delete(normalized);
      pendingRelayVerificationRef.current.set(normalized, {
        operation: relayStatus === "read-only" ? "write" : "read",
        requestedAt: Date.now(),
      });
      relaysPendingAuthSubscriptionReplayRef.current.add(normalized);
    }
    nostrDevLog("relay", "Relay reconnect requested", {
      relayUrl: normalized,
      relayStatus,
      retryAuth: Boolean(ndk.signer),
      replaySubscriptionsAfterAuth: Boolean(ndk.signer),
      reconnectMode: forceNewSocket ? "hard" : "soft",
    });

    const relay = connectManagedRelay(ndk, normalized, { forceNewSocket });
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
  }, [connectManagedRelay, ndk, primeRelayAuthChallenge, resolveConnectedRelayStatus, updateRelayEntry]);

  const { publishEvent } = usePublish({
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

  // Mirror the authenticated user's own profile into the shared Kind 0 cache so
  // every UserAvatar (sidebar, hover card, kanban card, user menu, …) resolves
  // to the same picture/displayName from a single source of truth.
  useEffect(() => {
    if (!user?.pubkey) return;
    const profile = user.profile ?? {};
    seedNostrProfile({
      pubkey: user.pubkey,
      name: profile.name,
      displayName: profile.displayName,
      picture: profile.picture,
      about: profile.about,
      nip05: profile.nip05,
      banner: profile.banner,
      website: profile.website,
      lud16: profile.lud16,
    });
  }, [user?.pubkey, user?.profile]);


  const { subscribe } = useSubscribe({
    ndk,
    relaysRef,
    authMethodRef,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
    relaysPendingAuthSubscriptionReplayRef,
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
