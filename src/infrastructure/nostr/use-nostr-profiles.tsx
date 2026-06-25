import { useCallback, useMemo, useSyncExternalStore } from "react";
import { NDKEvent, profileFromEvent, type NDKUserProfile } from "@nostr-dev-kit/ndk";
import type { NostrEvent } from "@/lib/nostr/types";
import {
  getKind0CacheVersion,
  loadCachedKind0Events,
  subscribeToKind0Cache,
} from "@/infrastructure/nostr/people-from-kind0";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import type { Person } from "@/types/person";
import { buildFallbackPersonFromPubkey } from "@/domain/people/resolve-person";

// NDK's NDKUserProfile is our canonical parsed-kind-0 shape. We tack `pubkey`
// on at the cache boundary so consumers don't need to track it separately.
export type NostrProfile = NDKUserProfile & { pubkey: string };

interface ProfileCache {
  [pubkey: string]: NostrProfile;
}

const EMPTY_PUBKEYS: string[] = [];
const EMPTY_PROFILES: ProfileCache = {};

function normalizePubkey(pubkey: string): string {
  return pubkey.trim().toLowerCase();
}

export function parseEventToProfile(event: NostrEvent): NostrProfile {
  let profile: NDKUserProfile;
  try {
    // NDK's parser expects an NDKEvent; ours are plain NostrEvents.
    // profileFromEvent only touches .content and .rawEvent(), so a bare
    // wrapper is enough.
    const ndkEvent = new NDKEvent(undefined, event as never);
    profile = profileFromEvent(ndkEvent);
  } catch {
    // NDK throws on malformed content JSON; surface as a pubkey-only profile.
    profile = {};
  }
  // NDK stuffs JSON.stringify(rawEvent()) onto profile.profileEvent on every
  // parse — we never read it and it would bloat every cache entry.
  delete profile.profileEvent;
  return { ...profile, pubkey: event.pubkey };
}

// Memoize parsed profile per event reference. Kind0Cache hands back stable
// event objects until the next ingest, so the same event reference always
// yields the same profile reference — keeps useSyncExternalStore snapshots
// reference-stable.
const profileByEvent = new WeakMap<NostrEvent, NostrProfile>();
function eventToProfile(event: NostrEvent | undefined): NostrProfile | null {
  if (!event) return null;
  const existing = profileByEvent.get(event);
  if (existing) return existing;
  const profile = parseEventToProfile(event);
  profileByEvent.set(event, profile);
  return profile;
}

// Lazy pubkey → event index, refreshed when Kind0Cache version bumps.
let cachedIndexVersion = -1;
let cachedIndex: Map<string, NostrEvent> = new Map();
function getCachedIndex(): Map<string, NostrEvent> {
  const version = getKind0CacheVersion();
  if (version !== cachedIndexVersion) {
    const next = new Map<string, NostrEvent>();
    for (const event of loadCachedKind0Events()) {
      const pk = normalizePubkey(event.pubkey ?? "");
      if (!pk) continue;
      const prior = next.get(pk);
      if (!prior || (event.created_at ?? 0) > (prior.created_at ?? 0)) {
        next.set(pk, event);
      }
    }
    cachedIndex = next;
    cachedIndexVersion = version;
  }
  return cachedIndex;
}

export function getProfileSnapshot(pubkey: string | null): NostrProfile | null {
  if (!pubkey) return null;
  return eventToProfile(getCachedIndex().get(normalizePubkey(pubkey)));
}

/**
 * Imperative (non-hook) resolve of a pubkey to a Person via the kind-0 cache,
 * falling back to a pubkey-derived synthetic. For command handlers (toasts,
 * mention queue, sidebar list growth) that need a Person but run outside React
 * render — render paths use `useCachedNostrProfile` directly.
 */
export function getResolvedPerson(pubkey: string): Person {
  const profile = getProfileSnapshot(pubkey);
  if (!profile) return buildFallbackPersonFromPubkey(pubkey);
  return {
    pubkey: profile.pubkey,
    name: profile.name ?? "",
    displayName: profile.displayName ?? "",
    nip05: profile.nip05,
    avatar: profile.picture ?? "",
  };
}

export function useNostrProfiles(pubkeys: string[]): {
  profiles: ProfileCache;
  loading: false;
  getProfile: (pubkey: string) => NostrProfile | null;
} {
  const version = useSyncExternalStore(
    subscribeToKind0Cache,
    getKind0CacheVersion,
    getKind0CacheVersion,
  );

  const pubkeysKey = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const pk of pubkeys) {
      if (!pk || seen.has(pk)) continue;
      seen.add(pk);
      list.push(pk);
    }
    return list.join(",");
  }, [pubkeys]);

  const normalizedPubkeys = useMemo(
    () => (pubkeysKey.length > 0 ? pubkeysKey.split(",") : EMPTY_PUBKEYS),
    [pubkeysKey],
  );

  const profiles = useMemo<ProfileCache>(() => {
    if (normalizedPubkeys.length === 0) return EMPTY_PROFILES;
    const result: ProfileCache = {};
    for (const pk of normalizedPubkeys) {
      const profile = getProfileSnapshot(pk);
      if (profile) result[pk] = profile;
    }
    return result;
    // version is what makes this re-derive when the cache changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, normalizedPubkeys]);

  const getProfile = useCallback(
    (pubkey: string): NostrProfile | null => profiles[pubkey] ?? getProfileSnapshot(pubkey),
    [profiles],
  );

  return { profiles, loading: false, getProfile };
}

export function useNostrProfile(pubkey: string | null): {
  profile: NostrProfile | null;
  loading: false;
} {
  const profile = useCachedNostrProfile(pubkey);
  return { profile, loading: false };
}

/**
 * Cache-only profile lookup against the shared Kind 0 cache. The live kind 0
 * subscription is what fills this cache; nothing else writes to it.
 */
export function useCachedNostrProfile(pubkey: string | null): NostrProfile | null {
  const getSnapshot = useCallback(() => getProfileSnapshot(pubkey), [pubkey]);
  return useSyncExternalStore(subscribeToKind0Cache, getSnapshot, getSnapshot);
}

export function getDefaultAvatarUrl(pubkey: string): string {
  void pubkey;
  return "";
}

// Generate display name from pubkey (fallback)
export function getDefaultDisplayName(pubkey: string): string {
  return formatUserFacingPubkey(pubkey);
}
