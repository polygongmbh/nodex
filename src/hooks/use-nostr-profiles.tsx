import { useState, useEffect, useCallback, useRef } from "react";
import { useNDK } from "@/lib/nostr/ndk-context";
import { NDKEvent, NDKFilter, NDKKind, NDKSubscription } from "@nostr-dev-kit/ndk";

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  nip05Verified?: boolean;
  banner?: string;
  website?: string;
  lud16?: string;
}

interface ProfileCache {
  [pubkey: string]: NostrProfile;
}

// Singleton cache to persist across component instances
const profileCache: ProfileCache = {};
const pendingRequests = new Set<string>();
const subscribers = new Set<() => void>();

// Notify all subscribers when cache updates
function notifySubscribers() {
  subscribers.forEach(callback => callback());
}

export function useNostrProfiles(pubkeys: string[]) {
  const { ndk } = useNDK();
  const [profiles, setProfiles] = useState<ProfileCache>({});
  const [loading, setLoading] = useState(false);
  const subscriptionRef = useRef<NDKSubscription | null>(null);
  
  // Subscribe to cache updates
  useEffect(() => {
    const updateFromCache = () => {
      const cached: ProfileCache = {};
      pubkeys.forEach(pk => {
        if (profileCache[pk]) {
          cached[pk] = profileCache[pk];
        }
      });
      setProfiles(cached);
    };
    
    subscribers.add(updateFromCache);
    updateFromCache(); // Initial load from cache
    
    return () => {
      subscribers.delete(updateFromCache);
    };
  }, [pubkeys.join(",")]);

  // Fetch missing profiles
  useEffect(() => {
    if (!ndk || pubkeys.length === 0) return;
    
    // Filter out already cached and pending profiles
    const missingPubkeys = pubkeys.filter(pk => 
      !profileCache[pk] && !pendingRequests.has(pk)
    );
    
    if (missingPubkeys.length === 0) return;
    
    // Mark as pending
    missingPubkeys.forEach(pk => pendingRequests.add(pk));
    setLoading(true);
    
    // Create subscription for profile events (kind 0)
    const filter: NDKFilter = {
      kinds: [0 as NDKKind],
      authors: missingPubkeys,
    };
    
    const sub = ndk.subscribe([filter], { closeOnEose: true });
    subscriptionRef.current = sub;
    
    sub.on("event", (event: NDKEvent) => {
      try {
        const content = JSON.parse(event.content);
        const profile: NostrProfile = {
          pubkey: event.pubkey,
          name: content.name,
          displayName: content.display_name || content.displayName,
          picture: content.picture,
          about: content.about,
          nip05: content.nip05,
          banner: content.banner,
          website: content.website,
          lud16: content.lud16,
        };
        
        // Update cache
        profileCache[event.pubkey] = profile;
        pendingRequests.delete(event.pubkey);
        
        // Notify subscribers
        notifySubscribers();
      } catch (e) {
        console.error("Failed to parse profile event:", e);
        pendingRequests.delete(event.pubkey);
      }
    });
    
    sub.on("eose", () => {
      // Mark remaining as not found (use default placeholder)
      missingPubkeys.forEach(pk => {
        pendingRequests.delete(pk);
        if (!profileCache[pk]) {
          // Create placeholder profile
          profileCache[pk] = {
            pubkey: pk,
            name: pk.slice(0, 8),
            displayName: `${pk.slice(0, 8)}...${pk.slice(-4)}`,
          };
        }
      });
      setLoading(false);
      notifySubscribers();
    });
    
    return () => {
      sub?.stop();
    };
  }, [ndk, pubkeys.join(",")]);

  // Get profile for a specific pubkey
  const getProfile = useCallback((pubkey: string): NostrProfile | null => {
    return profiles[pubkey] || profileCache[pubkey] || null;
  }, [profiles]);

  return { profiles, loading, getProfile };
}

// Hook for getting a single profile
export function useNostrProfile(pubkey: string | null) {
  const { profiles, loading, getProfile } = useNostrProfiles(pubkey ? [pubkey] : []);
  return {
    profile: pubkey ? getProfile(pubkey) : null,
    loading,
  };
}

// No remote avatar URL fallback; local generator is used in UI components.
export function getDefaultAvatarUrl(pubkey: string): string {
  void pubkey;
  return "";
}

// Generate display name from pubkey (fallback)
export function getDefaultDisplayName(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}
