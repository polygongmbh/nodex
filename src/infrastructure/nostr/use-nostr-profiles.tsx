import { useState, useEffect, useCallback, useMemo } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { NDKEvent, NDKFilter, NDKKind } from "@nostr-dev-kit/ndk";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

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
const EMPTY_PUBKEYS: string[] = [];

// Notify all subscribers when cache updates
function notifySubscribers() {
  subscribers.forEach(callback => callback());
}

function buildPubkeysKey(pubkeys: string[]): string {
  const seen = new Set<string>();
  const normalized: string[] = [];
  pubkeys.forEach((pubkey) => {
    if (!pubkey || seen.has(pubkey)) return;
    seen.add(pubkey);
    normalized.push(pubkey);
  });
  return normalized.join(",");
}

function profileMapEquals(a: ProfileCache, b: ProfileCache): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in b)) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function useNostrProfiles(pubkeys: string[]) {
  const { ndk, subscribe } = useNDK();
  const [profiles, setProfiles] = useState<ProfileCache>({});
  const [loading, setLoading] = useState(false);
  const pubkeysKey = useMemo(() => buildPubkeysKey(pubkeys), [pubkeys]);
  const normalizedPubkeys = useMemo(
    () => (pubkeysKey.length > 0 ? pubkeysKey.split(",") : EMPTY_PUBKEYS),
    [pubkeysKey]
  );
  
  // Subscribe to cache updates
  useEffect(() => {
    const updateFromCache = () => {
      const cached: ProfileCache = {};
      normalizedPubkeys.forEach(pk => {
        if (profileCache[pk]) {
          cached[pk] = profileCache[pk];
        }
      });
      setProfiles((previousProfiles) =>
        profileMapEquals(previousProfiles, cached) ? previousProfiles : cached
      );
    };
    
    subscribers.add(updateFromCache);
    updateFromCache(); // Initial load from cache
    
    return () => {
      subscribers.delete(updateFromCache);
    };
  }, [pubkeysKey, normalizedPubkeys]);

  // Fetch missing profiles
  useEffect(() => {
    if (!ndk || normalizedPubkeys.length === 0) return;
    
    // Filter out already cached and pending profiles
    const missingPubkeys = normalizedPubkeys.filter(pk => 
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
    
    const onProfileEvent = (event: NDKEvent) => {
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
    };
    const sub = subscribe([filter], onProfileEvent, { closeOnEose: true });
    if (!sub) {
      missingPubkeys.forEach(pk => pendingRequests.delete(pk));
      setLoading(false);
      return;
    }
    
    sub.on("eose", () => {
      // Mark remaining as not found (use default placeholder)
      missingPubkeys.forEach(pk => {
        pendingRequests.delete(pk);
        if (!profileCache[pk]) {
          // Create placeholder profile
          profileCache[pk] = {
            pubkey: pk,
            name: formatUserFacingPubkey(pk),
            displayName: formatUserFacingPubkey(pk),
          };
        }
      });
      setLoading(false);
      notifySubscribers();
    });
    
    return () => {
      sub?.stop();
    };
  }, [ndk, normalizedPubkeys, subscribe]);

  // Get profile for a specific pubkey
  const getProfile = useCallback((pubkey: string): NostrProfile | null => {
    return profiles[pubkey] || profileCache[pubkey] || null;
  }, [profiles]);

  return { profiles, loading, getProfile };
}

// Hook for getting a single profile
export function useNostrProfile(pubkey: string | null) {
  const stablePubkeys = useMemo(
    () => (pubkey ? [pubkey] : EMPTY_PUBKEYS),
    [pubkey]
  );
  const { profiles, loading, getProfile } = useNostrProfiles(stablePubkeys);
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
  return formatUserFacingPubkey(pubkey);
}
