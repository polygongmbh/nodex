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

interface ProfileCache {
  [pubkey: string]: Person;
}

const EMPTY_PUBKEYS: string[] = [];
const EMPTY_PROFILES: ProfileCache = {};

function normalizePubkey(pubkey: string): string {
  return pubkey.trim().toLowerCase();
}

/**
 * Parse a kind-0 event into the app's Person record via NDK's parser, keeping
 * only the fields the app reads. NDK maps `display_name → displayName` and
 * `image | picture → picture`; it throws on malformed content (→ pubkey-only
 * Person) and stuffs a bloaty `profileEvent` we never read, both sidestepped by
 * picking known fields.
 */
export function parseEventToProfile(event: NostrEvent): Person {
  let profile: NDKUserProfile;
  try {
    // NDK's parser expects an NDKEvent; ours are plain NostrEvents.
    // profileFromEvent only touches .content and .rawEvent(), so a bare
    // wrapper is enough.
    const ndkEvent = new NDKEvent(undefined, event as never);
    profile = profileFromEvent(ndkEvent);
  } catch {
    profile = {};
  }
  return {
    pubkey: event.pubkey,
    name: profile.name,
    displayName: profile.displayName,
    nip05: profile.nip05,
    about: profile.about,
    picture: profile.picture,
  };
}

// Memoize parsed profile per event reference. Kind0Cache hands back stable
// event objects until the next ingest, so the same event reference always
// yields the same profile reference — keeps useSyncExternalStore snapshots
// reference-stable.
const profileByEvent = new WeakMap<NostrEvent, Person>();
function eventToProfile(event: NostrEvent | undefined): Person | null {
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

export function getProfileSnapshot(pubkey: string | null): Person | null {
  if (!pubkey) return null;
  return eventToProfile(getCachedIndex().get(normalizePubkey(pubkey)));
}

/**
 * Imperative (non-hook) resolve of a pubkey to a Person via the kind-0 cache,
 * falling back to a pubkey-derived synthetic. For command handlers (toasts,
 * mention queue, sidebar list growth) that need a Person but run outside React
 * render.
 */
export function getResolvedPerson(pubkey: string): Person {
  return getProfileSnapshot(pubkey) ?? buildFallbackPersonFromPubkey(pubkey);
}

/**
 * Reactive resolve of a pubkey to a Person via the kind-0 cache. The canonical
 * render-time path for person components: they take a pubkey and resolve their
 * own display here, so nothing upstream snapshots/threads a Person.
 */
export function useResolvedPerson(pubkey: string): Person {
  const profile = useCachedNostrProfile(pubkey);
  return useMemo(() => profile ?? buildFallbackPersonFromPubkey(pubkey), [pubkey, profile]);
}

export function useNostrProfiles(pubkeys: string[]): {
  profiles: ProfileCache;
  loading: false;
  getProfile: (pubkey: string) => Person | null;
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
    (pubkey: string): Person | null => profiles[pubkey] ?? getProfileSnapshot(pubkey),
    [profiles],
  );

  return { profiles, loading: false, getProfile };
}

export function useNostrProfile(pubkey: string | null): {
  profile: Person | null;
  loading: false;
} {
  const profile = useCachedNostrProfile(pubkey);
  return { profile, loading: false };
}

/**
 * Cache-only profile lookup against the shared Kind 0 cache. The live kind 0
 * subscription is what fills this cache; nothing else writes to it.
 */
export function useCachedNostrProfile(pubkey: string | null): Person | null {
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
