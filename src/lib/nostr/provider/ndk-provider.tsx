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
import { getConfiguredDefaultRelays } from "@/lib/nostr/default-relays";
import { isRelayUrl } from "@/lib/nostr/relay-url";
import { nostrDevLog } from "../dev-logs";
import type { AuthMethod, NDKContextValue, NDKProviderProps, NDKRelayStatus, NostrUser } from "./contracts";
import {
  hasNostrExtension,
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
import { verifyNip05 } from "../nip05-verify";
import { createRelayNip42AuthPolicy, type RelayVerificationEvent } from "../nip42-relay-auth-policy";
import { createNip98AuthHeader } from "../nip98-http-auth";
import {
  isAuthRequiredCloseReason,
  shouldRetryAuthAfterReadRejection,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import i18n from "@/lib/i18n/config";
import { toast } from "sonner";
export type { AuthMethod, NostrUser, NDKRelayStatus, NDKContextValue } from "./contracts";

const NDKContext = createContext<NDKContextValue | null>(null);
const RELAY_VERIFICATION_TOAST_DEDUPE_MS = 15000;
type RelayOperation = "read" | "write" | "unknown";

export function NDKProvider({ children, defaultRelays }: NDKProviderProps) {
  const defaultRelaysKey = useMemo(() => (defaultRelays || []).join(","), [defaultRelays]);
  const resolvedDefaultRelays = useMemo(
    () => defaultRelays || getConfiguredDefaultRelays(),
    [defaultRelays]
  );
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NostrUser | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [relays, setRelays] = useState<NDKRelayStatus[]>([]);
  const [removedRelays, setRemovedRelays] = useState<Set<string>>(new Set());
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

  const shouldShowRelayVerificationToast = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    outcome: RelayVerificationEvent["outcome"]
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
  }, [shouldShowRelayVerificationToast]);

  const markRelayVerificationFailure = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    options?: { setStatus?: boolean }
  ) => {
    const shouldSetStatus = options?.setStatus ?? false;
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    pendingRelayVerificationRef.current.delete(normalizedRelayUrl);
    if (shouldSetStatus) {
      setRelays((previous) =>
        previous.map((relay) => {
          if (relay.url.replace(/\/+$/, "") !== normalizedRelayUrl) return relay;
          if (relay.status === "connection-error") return relay;
          return { ...relay, status: "verification-failed" };
        })
      );
    }
    if (!shouldShowRelayVerificationToast(relayUrl, operation, "failed")) {
      return;
    }
    if (operation === "read") {
      toast.error(i18n.t("toasts.errors.relayVerificationReadFailed", { relayUrl }));
    } else if (operation === "write") {
      toast.error(i18n.t("toasts.errors.relayVerificationWriteFailed", { relayUrl }));
    } else {
      toast.error(i18n.t("toasts.errors.relayVerificationUnknownFailed", { relayUrl }));
    }
  }, [shouldShowRelayVerificationToast]);

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
      });
    }
  }, [markRelayVerificationFailure, resolveRelayVerificationOperation]);

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
        [{ kinds: [NostrEventKind.Metadata], authors: [pubkey] }],
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
    nostrDevLog("provider", "Initializing NDK provider", {
      configuredDefaultRelays: resolvedDefaultRelays,
    });
    const ndkInstance = new NDK({
      explicitRelayUrls: resolvedDefaultRelays,
    });

    ndkInstance.relayAuthDefaultPolicy = createRelayNip42AuthPolicy(ndkInstance, notifyRelayVerificationEvent);

    // Set up relay event handlers
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "");
    const syncRelayStatusesFromPool = () => {
      setRelays((prev) => {
        const nextByUrl = new Map(prev.map((entry) => [normalizeUrl(entry.url), entry]));
        ndkInstance.pool.relays.forEach((relay: NDKRelay) => {
          const normalized = normalizeUrl(relay.url);
          const previousStatus = nextByUrl.get(normalized)?.status;
          if (relayAutoPausedRef.current.has(normalized)) {
            nextByUrl.set(normalized, { url: normalized, status: "connection-error" });
            return;
          }
          const mappedStatus = mapNativeRelayStatus(relay.status);
          nextByUrl.set(normalized, {
            url: normalized,
            status: previousStatus === "verification-failed" && mappedStatus === "connected"
              ? "verification-failed"
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
      const normalized = normalizeUrl(relay.url);
      nostrDevLog("relay", "Relay connected", { relayUrl: normalized });
      relayConnectedOnceRef.current.add(normalized);
      relayInitialFailureCountsRef.current.delete(normalized);
      relayAutoPausedRef.current.delete(normalized);
      const pendingVerification = pendingRelayVerificationRef.current.get(normalized);
      if (pendingVerification) {
        pendingRelayVerificationRef.current.delete(normalized);
        markRelayVerificationSuccess(normalized, pendingVerification.operation);
      }
      setRemovedRelays((removed) => {
        if (removed.has(normalized)) return removed;
        setRelays((prev) => {
          const existing = prev.find((r) => normalizeUrl(r.url) === normalized);
          if (existing) {
            return prev.map((r) =>
              normalizeUrl(r.url) === normalized
                ? {
                    ...r,
                    url: normalized,
                    status:
                      r.status === "verification-failed" && !pendingVerification
                        ? "verification-failed"
                        : "connected",
                  }
                : r
            );
          }
          return [...prev, { url: normalized, status: "connected" }];
        });
        return removed;
      });
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      nostrDevLog("relay", "Relay disconnected", { relayUrl: normalized });
      setRemovedRelays((removed) => {
        if (removed.has(normalized)) return removed;
        setRelays((prev) =>
          prev.map((r) =>
            normalizeUrl(r.url) === normalized ? { ...r, status: "disconnected" } : r
          )
        );
        return removed;
      });

      if (relayConnectedOnceRef.current.has(normalized)) return;
      if (relayAutoPausedRef.current.has(normalized)) return;

      const nextFailureCount = (relayInitialFailureCountsRef.current.get(normalized) ?? 0) + 1;
      relayInitialFailureCountsRef.current.set(normalized, nextFailureCount);

      if (nextFailureCount < MAX_INITIAL_CONNECT_FAILURES) return;

      relayAutoPausedRef.current.add(normalized);
      setRelays((prev) =>
        prev.map((entry) =>
          normalizeUrl(entry.url) === normalized ? { ...entry, status: "connection-error" } : entry
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
    setRelays(resolvedDefaultRelays.map((url) => ({ url, status: "connecting" })));
    nostrDevLog("relay", "Relay state initialized as connecting", {
      relayUrls: resolvedDefaultRelays,
    });

    setNdk(ndkInstance);

    // Try to restore session
    const savedAuthMethod = localStorage.getItem(STORAGE_KEY_AUTH) as AuthMethod;
    if (savedAuthMethod === "guest") {
      const savedNsec = localStorage.getItem(STORAGE_KEY_NSEC);
      if (savedNsec) {
        const signer = new NDKPrivateKeySigner(savedNsec);
        ndkInstance.signer = signer;
        signer.user().then((ndkUser) => {
          setUser({
            pubkey: ndkUser.pubkey,
            npub: ndkUser.npub,
          });
          setAuthMethod("guest");
        });
      }
    } else if (savedAuthMethod === "extension") {
      // Check if extension is available
      if (hasNostrExtension()) {
        const signer = new NDKNip07Signer();
        ndkInstance.signer = signer;
        signer.user().then((ndkUser) => {
          setUser({
            pubkey: ndkUser.pubkey,
            npub: ndkUser.npub,
          });
          setAuthMethod("extension");
        }).catch(() => {
          localStorage.removeItem(STORAGE_KEY_AUTH);
        });
      }
    } else if (savedAuthMethod === "nostrConnect") {
      const bunkerUrl = localStorage.getItem(STORAGE_KEY_NIP46_BUNKER);
      const localKey = localStorage.getItem(STORAGE_KEY_NIP46_LOCAL_NSEC) || undefined;
      if (!bunkerUrl) {
        localStorage.removeItem(STORAGE_KEY_AUTH);
      } else {
        const signer = NDKNip46Signer.bunker(ndkInstance, bunkerUrl, localKey);
        ndkInstance.signer = signer;
        signer.blockUntilReady().then(async (ndkUser: NDKUser) => {
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
        }).catch(() => {
          localStorage.removeItem(STORAGE_KEY_AUTH);
          localStorage.removeItem(STORAGE_KEY_NIP46_BUNKER);
          localStorage.removeItem(STORAGE_KEY_NIP46_LOCAL_NSEC);
        });
      }
    }

    // Connect after signer restore attempt so NIP-42 can authenticate immediately when possible.
    ndkInstance.connect().then(() => {
      nostrDevLog("provider", "NDK connected to relay pool");
      syncRelayStatusesFromPool();
    });
    const reconcileIntervalId = window.setInterval(
      syncRelayStatusesFromPool,
      RELAY_STATUS_RECONCILE_INTERVAL_MS
    );

    return () => {
      window.clearInterval(reconcileIntervalId);
      ndkInstance.pool.relays.forEach((relay) => {
        relay.disconnect();
      });
      ndkInstance.pool.removeAllListeners();
    };
  }, [defaultRelaysKey, markRelayVerificationSuccess, notifyRelayVerificationEvent, resolvedDefaultRelays]);

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
      return true;
    } catch (error) {
      console.error("Extension login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk]);

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
      return true;
    } catch (error) {
      console.error("Private key login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk]);

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
      return true;
    } catch (error) {
      console.error("Guest login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk]);

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
      return true;
    } catch (error) {
      console.error("Nostr Connect login failed:", error);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [ndk]);

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
    const normalizeUrl = (u: string) => u.replace(/\/+$/, "");
    const normalized = normalizeUrl(url);
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAutoPausedRef.current.delete(normalized);
    nostrDevLog("relay", "Adding relay and initiating connection", { relayUrl: normalized });

    // Add to relays state
    setRelays((prev) => {
      if (prev.some((r) => normalizeUrl(r.url) === normalized)) {
        return prev.map((r) =>
          normalizeUrl(r.url) === normalized ? { ...r, url: normalized, status: "connecting" } : r
        );
      }
      return [...prev, { url: normalized, status: "connecting" }];
    });

    // Connect via NDK
    const relay = ndk.pool.getRelay(normalized, true);
    relay?.connect();
  }, [ndk]);

  const removeRelay = useCallback((url: string) => {
    if (!ndk) return;

    const normalizeUrl = (u: string) => u.replace(/\/+$/, "");
    const normalized = normalizeUrl(url);

    // Mark as intentionally removed so disconnect events don't re-add it
    setRemovedRelays((prev) => new Set(prev).add(normalized));
    setRelays((prev) => prev.filter((r) => normalizeUrl(r.url) !== normalized));
    relayInitialFailureCountsRef.current.delete(normalized);
    relayConnectedOnceRef.current.delete(normalized);
    relayAutoPausedRef.current.delete(normalized);
    nostrDevLog("relay", "Removing relay and disconnecting", { relayUrl: normalized });
    
    const relay = ndk.pool.getRelay(url);
    if (relay) {
      relay.disconnect();
      ndk.pool.removeRelay(url);
    }
  }, [ndk]);

  const publishEvent = useCallback(async (
    kind: NostrEventKind,
    content: string,
    tags: string[][] = [],
    parentId?: string,
    relayUrls?: string[]
  ): Promise<{ success: boolean; eventId?: string }> => {
    if (!ndk || !ndk.signer) {
      console.error("Not authenticated or NDK not ready");
      return { success: false };
    }

    let signedEventId: string | undefined;
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
      
      const urls = (relayUrls && relayUrls.length > 0)
        ? relayUrls
        : relays.map((r) => r.url);
      const targetRelayUrls = urls.length > 0 ? urls : resolvedDefaultRelays;
      nostrDevLog("publish", "Preparing publish relay set", {
        kind,
        eventTagCount: eventTags.length,
        parentId: parentId || null,
        reason: relayUrls && relayUrls.length > 0 ? "explicit relay override" : "active relays fallback",
        targetRelayUrls,
      });
      const relaySet = NDKRelaySet.fromRelayUrls(
        targetRelayUrls,
        ndk,
        true
      );
      
      const publishedTo = await event.publish(relaySet);
      
      if (publishedTo.size === 0) {
        console.warn("Event publish completed but no relays confirmed receipt");
        return { success: false, eventId: event.id };
      }
      
      const publishedRelayUrls = Array.from(publishedTo).map((r) => r.url);
      nostrDevLog("publish", "Event published", {
        eventId: event.id,
        kind,
        publishedRelayUrls,
      });
      return { success: true, eventId: event.id };
    } catch (error) {
      console.error("Failed to publish event:", error);
      return { success: false, eventId: signedEventId };
    } finally {
      endRelayOperation("write");
    }
  }, [beginRelayOperation, endRelayOperation, ndk, relays, resolvedDefaultRelays]);

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
    onEvent: (event: NDKEvent) => void
  ): NDKSubscription | null => {
    if (!ndk) return null;
    nostrDevLog("subscribe", "Creating subscription", {
      filterCount: filters.length,
      filters,
    });

    beginRelayOperation("read");
    const subscription = ndk.subscribe(filters, { closeOnEose: false });
    
    subscription.on("event", (event: NDKEvent) => {
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
  }, [beginRelayOperation, endRelayOperation, markRelayVerificationFailure, ndk]);

  const isConnected = useMemo(() => {
    return relays.some((r) => r.status === "connected");
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
    logout,
    addRelay,
    removeRelay,
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
    logout,
    addRelay,
    removeRelay,
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
