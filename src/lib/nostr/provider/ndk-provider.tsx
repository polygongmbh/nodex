import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import NDK, {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKUser,
  NDKRelay,
} from "@nostr-dev-kit/ndk";
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
} from "./relay-status";
import {
  appendResolvedRelayUrl,
  mergeConfiguredRelayStatuses,
  normalizeRelayUrl,
  removeResolvedRelayUrl,
} from "./relay-list";
import { waitForNostrExtensionAvailability } from "./session-restore";
import { createRelayNip42AuthPolicy } from "../nip42-relay-auth-policy";
import { fetchRelayInfo, type RelayInfoSummary } from "../relay-info";
import { shouldReconnectRelayAfterResume, shouldReconnectRelayAfterSignIn } from "./relay-verification";
import { useRelayTransport, type RelayTransportRefs } from "./use-relay-transport";
import { useRelayVerification } from "./use-relay-verification";
import { usePublish } from "./use-publish";
import { useAuthActions } from "./use-auth-actions";
import { useRelayEnrichment } from "./use-relay-enrichment";
import { useProfileSync } from "./use-profile-sync";
import type { RelayOperation } from "./use-relay-transport";

export type { AuthMethod, NostrUser, NDKRelayStatus, NDKContextValue } from "./contracts";

const NDKContext = createContext<NDKContextValue | null>(null);
const RELAY_RESUME_RECONNECT_COOLDOWN_MS = 5000;

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
  const ndkRef = useRef<NDK | null>(null);
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
  const relayCurrentInstanceRef = useRef<Map<string, NDKRelay>>(new Map());
  const relayAuthRetrySessionKeyRef = useRef<string | null>(null);
  const relayAuthRetriedUrlsForSessionRef = useRef<Set<string>>(new Set());
  const complementaryRelaySyncKeyRef = useRef<string | null>(null);
  const lastResumeReconnectAtRef = useRef(0);
  const initialResolvedDefaultRelaysRef = useRef<string[] | null>(null);

  if (!isResolvingDefaultRelays && initialResolvedDefaultRelaysRef.current === null) {
    initialResolvedDefaultRelaysRef.current = resolvedDefaultRelays;
  }
  const initialRelayUrls = initialResolvedDefaultRelaysRef.current;

  // Keep ndkRef in sync with ndk state so hooks have stable ref access
  useEffect(() => {
    ndkRef.current = ndk;
  }, [ndk]);

  const transportRefs: RelayTransportRefs = {
    removedRelaysRef,
    relayInitialFailureCountsRef,
    relayConnectedOnceRef,
    relayAutoPausedRef,
    relayVerificationReadOpsRef,
    relayVerificationWriteOpsRef,
    relayAttemptStartedAtRef,
    relayCurrentInstanceRef,
    relayReadRejectedRef,
    relayWriteRejectedRef,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
  };

  const transport = useRelayTransport(transportRefs, ndkRef, setRelays, relayInfoRef);

  const verification = useRelayVerification(
    {
      relayVerificationToastHistoryRef,
      pendingRelayVerificationRef,
      relayInfoRef,
      relayVerificationReadOpsRef,
      relayVerificationWriteOpsRef,
      relayReadRejectedRef,
      relayWriteRejectedRef,
    },
    transport,
    setRelays,
    relays,
  );

  const { publishEvent, subscribe, createHttpAuthHeader } = usePublish(
    ndkRef,
    relays,
    resolvedDefaultRelays,
    verification,
    transport,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
  );

  const { loginWithExtension, loginWithPrivateKey, loginAsGuest, loginWithNostrConnect, getGuestPrivateKey, logout } =
    useAuthActions(
      ndkRef,
      relays,
      resolvedDefaultRelays,
      verification.retryNip42RelaysAfterSignIn,
      publishEvent,
      profileSyncRunRef,
      setUser,
      setAuthMethod,
      setIsAuthenticating,
      setIsProfileSyncing,
      authMethod,
    );

  const { updateUserProfile, userProfileSnapshot } = useProfileSync(
    ndk,
    user,
    relays,
    publishEvent,
    profileSyncRunRef,
    setUser,
    setNeedsProfileSetup,
    setIsProfileSyncing,
    verification.beginRelayOperation,
    verification.endRelayOperation,
  );

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

  // Auto-retry NIP-42 auth relays after sign-in
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
      .filter((relay) => shouldReconnectRelayAfterSignIn(relay))
      .map((relay) => normalizeRelayUrl(relay.url))
      .filter((relayUrl) => !relayAuthRetriedUrlsForSessionRef.current.has(relayUrl));

    if (relayUrlsToRetry.length === 0) return;

    relayUrlsToRetry.forEach((relayUrl) => {
      relayAuthRetriedUrlsForSessionRef.current.add(relayUrl);
    });
    verification.retryNip42RelaysAfterSignIn(relayUrlsToRetry);
  }, [authMethod, ndk, relays, verification, user?.pubkey]);

  // Initialize NDK once after default relays are resolved.
  useEffect(() => {
    if (isResolvingDefaultRelays || !initialRelayUrls) return;

    let disposed = false;
    nostrDevLog("provider", "Initializing NDK provider", {
      configuredDefaultRelays: initialRelayUrls,
    });
    const ndkInstance = new NDK({
      explicitRelayUrls: initialRelayUrls,
    });

    ndkInstance.relayAuthDefaultPolicy = createRelayNip42AuthPolicy(ndkInstance, verification.notifyRelayVerificationEvent);

    // Set up relay event handlers
    const syncRelayStatusesFromPool = () => {
      const now = Date.now();
      setRelays((prev) => {
        const nextByUrl = new Map(prev.map((entry) => [normalizeRelayUrl(entry.url), entry]));
        ndkInstance.pool.relays.forEach((relay: NDKRelay) => {
          const normalized = normalizeRelayUrl(relay.url);
          relayCurrentInstanceRef.current.set(normalized, relay);
          if (removedRelaysRef.current.has(normalized)) return;
          const previousEntry = nextByUrl.get(normalized);
          const mappedStatus = mapNativeRelayStatus(relay.status);
          const info = relayInfoRef.current.get(normalized);
          nextByUrl.set(normalized, {
            ...previousEntry,
            url: normalized,
            status: transport.resolveRelayUiStatus(normalized, {
              mappedStatus,
              previousStatus: previousEntry?.status,
              now,
            }),
            nip11: previousEntry?.nip11 ?? (info
              ? {
                  authRequired: info.authRequired,
                  supportsNip42: info.supportsNip42,
                  checkedAt: Date.now(),
                }
              : undefined),
          });
        });
        return Array.from(nextByUrl.values());
      });
    };

    ndkInstance.pool.relays.forEach((relay) => {
      relayCurrentInstanceRef.current.set(normalizeRelayUrl(relay.url), relay);
    });

    ndkInstance.pool.on("relay:connecting", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      if (!transport.isCurrentRelayInstance(relay)) return;
      relayCurrentInstanceRef.current.set(normalized, relay);
      transport.updateRelayStatus(normalized, {
        mappedStatus: mapNativeRelayStatus(relay.status),
        ensureEntry: true,
      });
    });

    ndkInstance.pool.on("relay:connect", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      if (!transport.isCurrentRelayInstance(relay)) return;
      relayCurrentInstanceRef.current.set(normalized, relay);
      nostrDevLog("relay", "Relay connected", { relayUrl: normalized });
      relayConnectedOnceRef.current.add(normalized);
      relayInitialFailureCountsRef.current.delete(normalized);
      relayAutoPausedRef.current.delete(normalized);
      relayAttemptStartedAtRef.current.delete(normalized);
      const pendingVerification = pendingRelayVerificationRef.current.get(normalized);
      if (pendingVerification) {
        pendingRelayVerificationRef.current.delete(normalized);
        verification.markRelayVerificationSuccess(normalized, pendingVerification.operation);
      }
      if (removedRelaysRef.current.has(normalized)) return;
      transport.updateRelayStatus(normalized, {
        mappedStatus: mapNativeRelayStatus(relay.status),
        ensureEntry: true,
      });
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeRelayUrl(relay.url);
      if (!transport.isCurrentRelayInstance(relay)) return;
      nostrDevLog("relay", "Relay disconnected", { relayUrl: normalized });
      if (removedRelaysRef.current.has(normalized)) return;

      transport.updateRelayStatus(normalized, {
        mappedStatus: "disconnected",
        now: Date.now(),
        ensureEntry: true,
      });

      if (relayConnectedOnceRef.current.has(normalized)) return;
      if (relayAutoPausedRef.current.has(normalized)) return;

      const nextFailureCount = (relayInitialFailureCountsRef.current.get(normalized) ?? 0) + 1;
      relayInitialFailureCountsRef.current.set(normalized, nextFailureCount);

      if (nextFailureCount < MAX_INITIAL_CONNECT_FAILURES) return;

      relayAutoPausedRef.current.add(normalized);
      relayAttemptStartedAtRef.current.delete(normalized);
      transport.updateRelayStatus(normalized, {
        mappedStatus: "disconnected",
        now: Date.now(),
        ensureEntry: true,
      });
      console.warn("Relay auto-paused after repeated failed connection attempts", {
        relayUrl: normalized,
        failures: nextFailureCount,
      });

      ndkInstance.pool.removeRelay(relay.url);
    });

    // Initialize relay states
    removedRelaysRef.current.clear();
    initialRelayUrls.forEach((relayUrl) => {
      relayAttemptStartedAtRef.current.set(normalizeRelayUrl(relayUrl), Date.now());
    });
    setRelays(initialRelayUrls.map((url) => {
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
      relayUrls: initialRelayUrls,
    });
    initialRelayUrls.forEach((relayUrl) => {
      void verification.probeRelayInfo(relayUrl);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRelayUrls, isResolvingDefaultRelays]);

  const addRelay = useCallback((url: string) => {
    const currentNdk = ndkRef.current;
    if (!currentNdk) return;

    if (!isRelayUrl(url)) {
      console.error("Invalid relay URL");
      return;
    }
    const normalized = normalizeRelayUrl(url);
    removedRelaysRef.current.delete(normalized);
    setResolvedDefaultRelays((previous) => appendResolvedRelayUrl(previous, normalized));
    nostrDevLog("relay", "Adding relay and initiating connection", { relayUrl: normalized });
    void verification.probeRelayInfo(normalized);

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

    transport.connectRelay(normalized, {
      clearCapabilityState: true,
    });
  }, [ndkRef, transport, verification]);

  const removeRelay = useCallback((url: string) => {
    const currentNdk = ndkRef.current;
    if (!currentNdk) return;

    const normalized = normalizeRelayUrl(url);
    const currentRelay = relayCurrentInstanceRef.current.get(normalized) ?? currentNdk.pool.getRelay(normalized, false);

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

    if (currentRelay) {
      relayCurrentInstanceRef.current.set(normalized, currentRelay);
      currentNdk.pool.removeRelay(normalized);
      if (relayCurrentInstanceRef.current.get(normalized) === currentRelay) {
        relayCurrentInstanceRef.current.delete(normalized);
      }
    }
  }, [ndkRef]);

  const reconnectRelay = useCallback((url: string) => {
    const normalized = normalizeRelayUrl(url);
    nostrDevLog("relay", "Manual relay reconnect requested", { relayUrl: normalized });
    transport.connectRelay(normalized, {
      forceNewSocket: true,
      clearCapabilityState: true,
    });
  }, [transport]);

  const reconnectInactiveRelaysAfterResume = useCallback((reason: "visibility" | "focus" | "online") => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const now = Date.now();
    if (now - lastResumeReconnectAtRef.current < RELAY_RESUME_RECONNECT_COOLDOWN_MS) {
      return;
    }

    const targets = relays
      .filter((relay) => shouldReconnectRelayAfterResume(relay))
      .map((relay) => relay.url);

    if (targets.length === 0) return;
    lastResumeReconnectAtRef.current = now;

    nostrDevLog("relay", "Auto reconnecting relays after tab resume", {
      reason,
      relayUrls: targets,
    });

    for (const url of targets) {
      transport.connectRelay(url);
    }
  }, [transport, relays]);

  // Visibility/focus/online reconnect effect
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

  // Complementary relay enrichment from NIP-65 and NIP-05 profile data
  useRelayEnrichment(
    ndk,
    user,
    relays,
    removedRelaysRef,
    addRelay,
    verification.beginRelayOperation,
    verification.endRelayOperation,
    complementaryRelaySyncKeyRef,
  );

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
