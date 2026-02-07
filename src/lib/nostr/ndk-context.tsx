import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from "react";
import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKUser,
  NDKRelay,
  NDKFilter,
  NDKSubscription,
} from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "./types";

// Authentication types
export type AuthMethod = "extension" | "privateKey" | "guest" | null;

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
  logout: () => void;
  
  // Relay management
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  
  // Event publishing
  publishEvent: (kind: NostrEventKind, content: string, tags?: string[][], parentId?: string) => Promise<boolean>;
  
  // Subscription
  subscribe: (filters: NDKFilter[], onEvent: (event: NDKEvent) => void) => NDKSubscription | null;
  
  // Guest key export
  getGuestPrivateKey: () => string | null;
}

const NDKContext = createContext<NDKContextValue | null>(null);

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://test.nostr.melonion.me",
  "wss://nos.lol",
];

// Storage keys
const STORAGE_KEY_AUTH = "nostr_auth_method";
const STORAGE_KEY_NSEC = "nostr_guest_nsec";

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

  // Initialize NDK
  useEffect(() => {
    const ndkInstance = new NDK({
      explicitRelayUrls: defaultRelays,
    });

    // Set up relay event handlers
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "");

    ndkInstance.pool.on("relay:connect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      setRelays((prev) => {
        const existing = prev.find((r) => normalizeUrl(r.url) === normalized);
        if (existing) {
          return prev.map((r) =>
            normalizeUrl(r.url) === normalized ? { ...r, url: normalized, status: "connected" } : r
          );
        }
        return [...prev, { url: normalized, status: "connected" }];
      });
    });

    ndkInstance.pool.on("relay:disconnect", (relay: NDKRelay) => {
      const normalized = normalizeUrl(relay.url);
      setRelays((prev) =>
        prev.map((r) =>
          normalizeUrl(r.url) === normalized ? { ...r, status: "disconnected" } : r
        )
      );
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
      if (typeof window !== "undefined" && (window as any).nostr) {
        const signer = new NDKNip07Signer();
        ndkInstance.signer = signer;
        signer.user().then((ndkUser) => {
          setUser({
            pubkey: ndkUser.pubkey,
            npub: ndkUser.npub,
          });
          setAuthMethod("extension");
          // Fetch profile
          ndkUser.fetchProfile().then(() => {
            setUser((prev) => prev ? {
              ...prev,
              profile: {
                name: ndkUser.profile?.name,
                displayName: ndkUser.profile?.displayName,
                picture: ndkUser.profile?.image,
                about: ndkUser.profile?.about,
                nip05: ndkUser.profile?.nip05,
              },
            } : null);
          });
        }).catch(() => {
          localStorage.removeItem(STORAGE_KEY_AUTH);
        });
      }
    }

    return () => {
      ndkInstance.pool.removeAllListeners();
    };
  }, []);

  const loginWithExtension = useCallback(async (): Promise<boolean> => {
    if (!ndk) return false;
    
    if (typeof window === "undefined" || !(window as any).nostr) {
      console.error("No Nostr extension found");
      return false;
    }

    setIsAuthenticating(true);
    try {
      const signer = new NDKNip07Signer();
      ndk.signer = signer;
      
      const ndkUser = await signer.user();
      await ndkUser.fetchProfile();
      
      const nip05 = ndkUser.profile?.nip05;
      let nip05Verified = false;
      
      if (nip05) {
        nip05Verified = await verifyNip05(nip05, ndkUser.pubkey);
      }
      
      setUser({
        pubkey: ndkUser.pubkey,
        npub: ndkUser.npub,
        profile: {
          name: ndkUser.profile?.name,
          displayName: ndkUser.profile?.displayName,
          picture: ndkUser.profile?.image,
          about: ndkUser.profile?.about,
          nip05,
          nip05Verified,
        },
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
      let nsec = localStorage.getItem(STORAGE_KEY_NSEC);
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

  const getGuestPrivateKey = useCallback((): string | null => {
    if (authMethod !== "guest") return null;
    return localStorage.getItem(STORAGE_KEY_NSEC);
  }, [authMethod]);

  const logout = useCallback(() => {
    if (ndk) {
      ndk.signer = undefined;
    }
    setUser(null);
    setAuthMethod(null);
    localStorage.removeItem(STORAGE_KEY_AUTH);
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
    
    const relay = ndk.pool.getRelay(url);
    if (relay) {
      relay.disconnect();
      ndk.pool.removeRelay(url);
    }
    
    setRelays((prev) => prev.filter((r) => r.url !== url));
  }, [ndk]);

  const publishEvent = useCallback(async (
    kind: NostrEventKind,
    content: string,
    tags: string[][] = [],
    parentId?: string
  ): Promise<boolean> => {
    if (!ndk || !ndk.signer) {
      console.error("Not authenticated or NDK not ready");
      return false;
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

      // Extract hashtags from content and add as t tags
      const hashtagRegex = /#(\\w+)/g;
      let match;
      while ((match = hashtagRegex.exec(content)) !== null) {
        eventTags.push(["t", match[1].toLowerCase()]);
      }
      
      event.tags = eventTags;
      
      await event.sign();
      await event.publish();
      
      console.log("Event published:", event.id);
      return true;
    } catch (error) {
      console.error("Failed to publish event:", error);
      return false;
    }
  }, [ndk]);

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
    logout,
    addRelay,
    removeRelay,
    publishEvent,
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
    logout,
    addRelay,
    removeRelay,
    publishEvent,
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
