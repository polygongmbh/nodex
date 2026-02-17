import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, ReactNode } from "react";
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
import { NostrEventKind } from "./types";
import {
  buildKind0Content,
  hasRequiredProfileFields,
  mergeKind0Profiles,
  type EditableNostrProfile,
} from "./profile-metadata";

// Authentication types
export type AuthMethod = "extension" | "privateKey" | "guest" | "nostrConnect" | null;

export interface NostrUser {
  pubkey: string;
  npub: string;
  profile?: {
    name?: string;
    displayName?: string;
    picture?: string;
    about?: string;
    nip05?: string;
    nip05Verified?: boolean;
  };
}

export interface NDKRelayStatus {
  url: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  latency?: number;
}

export interface NDKContextValue {
  ndk: NDK | null;
  isConnected: boolean;
  relays: NDKRelayStatus[];
  user: NostrUser | null;
  authMethod: AuthMethod;
  isAuthenticating: boolean;
  
  // Auth methods
  loginWithExtension: () => Promise<boolean>;
  loginWithPrivateKey: (nsecOrHex: string) => Promise<boolean>;
  loginAsGuest: () => Promise<boolean>;
  loginWithNostrConnect: (bunkerUrl: string) => Promise<boolean>;
  logout: () => void;
  
  // Relay management
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  
  // Event publishing
  publishEvent: (kind: NostrEventKind, content: string, tags?: string[][], parentId?: string, relayUrls?: string[]) => Promise<{ success: boolean; eventId?: string }>;
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  needsProfileSetup: boolean;
  isProfileSyncing: boolean;
  
  // Subscription
  subscribe: (filters: NDKFilter[], onEvent: (event: NDKEvent) => void) => NDKSubscription | null;
  
  // Guest key export
  getGuestPrivateKey: () => string | null;
}

const NDKContext = createContext<NDKContextValue | null>(null);

const DEFAULT_RELAYS = [
  "wss://test.nostr.melonion.me",
];

// Storage keys
const STORAGE_KEY_AUTH = "nostr_auth_method";
const STORAGE_KEY_NSEC = "nostr_guest_nsec";
const STORAGE_KEY_NIP46_BUNKER = "nostr_nip46_bunker";
const STORAGE_KEY_NIP46_LOCAL_NSEC = "nostr_nip46_local_nsec";
type WindowWithNostr = Window & { nostr?: unknown };

const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);

// NIP-05 verification helper
async function verifyNip05(nip05: string, pubkey: string): Promise<boolean> {
  try {
    const [name, domain] = nip05.split("@");
    if (!name || !domain) return false;
    
    const url = `https://${domain}/.well-known/nostr.json?name=${name}`;
    const response = await fetch(url);
    if (!response.ok) return false;
    
    const data = await response.json();
    const registeredPubkey = data.names?.[name];
    
    return registeredPubkey === pubkey;
  } catch {
    return false;
  }
}

interface NDKProviderProps {
  children: ReactNode;
  defaultRelays?: string[];
}

export function NDKProvider({ children, defaultRelays = DEFAULT_RELAYS }: NDKProviderProps) {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NostrUser | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [relays, setRelays] = useState<NDKRelayStatus[]>([]);
  const [removedRelays, setRemovedRelays] = useState<Set<string>>(new Set());
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const profileSyncRunRef = useRef(0);

  const fetchLatestKind0Profile = useCallback(async (pubkey: string): Promise<NostrUser["profile"] | null> => {
    if (!ndk) return null;

    return await new Promise((resolve) => {
      const candidates: { createdAt: number; content: string }[] = [];
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
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

      const subscription = ndk.subscribe(
        [{ kinds: [NostrEventKind.Metadata], authors: [pubkey], limit: 50 }],
        { closeOnEose: true }
      );

      subscription.on("event", (event: NDKEvent) => {
        if (event.content) {
          candidates.push({ createdAt: event.created_at || 0, content: event.content });
        }
      });
      subscription.on("eose", finish);

      // Fallback so the UI does not hang if eose never arrives.
      setTimeout(finish, 3500);
    });
  }, [ndk]);

  // Initialize NDK
  useEffect(() => {
    const ndkInstance = new NDK({
      explicitRelayUrls: defaultRelays,
    });

    // Set up relay event handlers
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "");

    ndkInstance.pool.on("relay:connect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      setRemovedRelays((removed) => {
        if (removed.has(normalized)) return removed;
        setRelays((prev) => {
          const existing = prev.find((r) => normalizeUrl(r.url) === normalized);
          if (existing) {
            return prev.map((r) =>
              normalizeUrl(r.url) === normalized ? { ...r, url: normalized, status: "connected" } : r
            );
          }
          return [...prev, { url: normalized, status: "connected" }];
        });
        return removed;
      });
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      setRemovedRelays((removed) => {
        if (removed.has(normalized)) return removed;
        setRelays((prev) =>
          prev.map((r) =>
            normalizeUrl(r.url) === normalized ? { ...r, status: "disconnected" } : r
          )
        );
        return removed;
      });
    });

    // Initialize relay states
    setRelays(defaultRelays.map((url) => ({ url, status: "connecting" })));

    // Connect
    ndkInstance.connect().then(() => {
      console.log("NDK connected to relays");
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

    return () => {
      ndkInstance.pool.removeAllListeners();
    };
  }, [defaultRelays]);

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
          name: "Guest",
          displayName: "Guest User",
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

  const logout = useCallback(() => {
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
  }, [ndk]);

  const addRelay = useCallback((url: string) => {
    if (!ndk) return;
    
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      console.error("Invalid relay URL");
      return;
    }

    // Add to relays state
    setRelays((prev) => {
      if (prev.some((r) => r.url === url)) return prev;
      return [...prev, { url, status: "connecting" }];
    });

    // Connect via NDK
    const relay = ndk.pool.getRelay(url, true);
    relay?.connect();
  }, [ndk]);

  const removeRelay = useCallback((url: string) => {
    if (!ndk) return;

    const normalizeUrl = (u: string) => u.replace(/\/+$/, "");
    const normalized = normalizeUrl(url);

    // Mark as intentionally removed so disconnect events don't re-add it
    setRemovedRelays((prev) => new Set(prev).add(normalized));
    setRelays((prev) => prev.filter((r) => normalizeUrl(r.url) !== normalized));
    
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

    try {
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
      
      const urls = (relayUrls && relayUrls.length > 0)
        ? relayUrls
        : relays.map((r) => r.url);
      const relaySet = NDKRelaySet.fromRelayUrls(
        urls.length > 0 ? urls : defaultRelays,
        ndk,
        true
      );
      
      const publishedTo = await event.publish(relaySet);
      
      if (publishedTo.size === 0) {
        console.warn("Event publish completed but no relays confirmed receipt");
        return { success: false, eventId: event.id };
      }
      
      console.log("Event published:", event.id, "to", Array.from(publishedTo).map((r) => r.url));
      return { success: true, eventId: event.id };
    } catch (error) {
      console.error("Failed to publish event:", error);
      return { success: false };
    }
  }, [ndk, relays, defaultRelays]);

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

    const syncRun = profileSyncRunRef.current + 1;
    profileSyncRunRef.current = syncRun;
    let cancelled = false;
    const isStale = () => cancelled || profileSyncRunRef.current !== syncRun;

    setIsProfileSyncing(true);
    setNeedsProfileSetup(false);

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
        ...(user.profile || {}),
        ...(signerProfile || {}),
        ...(kind0Profile || {}),
      };

      let nip05Verified = false;
      if (mergedProfile.nip05) {
        nip05Verified = await verifyNip05(mergedProfile.nip05, user.pubkey);
      }
      if (isStale()) return;

      setUser((prev) => {
        if (!prev || prev.pubkey !== user.pubkey) return prev;
        return {
          ...prev,
          profile: {
            ...mergedProfile,
            nip05Verified,
          },
        };
      });
      setNeedsProfileSetup(!hasRequiredProfileFields(mergedProfile));
      setIsProfileSyncing(false);
    };

    void syncProfile().catch((error) => {
      if (isStale()) return;
      console.warn("Profile sync failed", error);
      setNeedsProfileSetup(!(user.profile && hasRequiredProfileFields(user.profile)));
      setIsProfileSyncing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ndk, fetchLatestKind0Profile, user?.pubkey]);

  const subscribe = useCallback((
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void
  ): NDKSubscription | null => {
    if (!ndk) return null;

    const subscription = ndk.subscribe(filters, { closeOnEose: false });
    
    subscription.on("event", (event: NDKEvent) => {
      onEvent(event);
    });

    return subscription;
  }, [ndk]);

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
