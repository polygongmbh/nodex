import { useCallback, useMemo, useSyncExternalStore } from "react";
import { NostrEventKind, type NostrEvent } from "@/lib/nostr/types";
import {
  defaultKind0Cache,
  getKind0CacheVersion,
  loadCachedKind0Events,
  subscribeToKind0Cache,
} from "@/infrastructure/nostr/people-from-kind0";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  website?: string;
  lud16?: string;
}

interface ProfileCache {
  [pubkey: string]: NostrProfile;
}

const EMPTY_PUBKEYS: string[] = [];
const EMPTY_PROFILES: ProfileCache = {};

function normalizePubkey(pubkey: string): string {
  return pubkey.trim().toLowerCase();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseEventToProfile(event: NostrEvent): NostrProfile {
  let parsed: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(event.content);
    if (raw && typeof raw === "object") parsed = raw as Record<string, unknown>;
  } catch {
    // Malformed kind 0 content — fall through to a pubkey-only profile.
  }
  return {
    pubkey: event.pubkey,
    name: stringOrUndefined(parsed.name),
    // Some clients (and the published payload in profile-metadata.ts) use
    // camelCase; the NIP-01 example uses snake_case. Accept both.
    displayName:
      stringOrUndefined(parsed.display_name) || stringOrUndefined(parsed.displayName),
    picture: stringOrUndefined(parsed.picture),
    about: stringOrUndefined(parsed.about),
    nip05: stringOrUndefined(parsed.nip05),
    banner: stringOrUndefined(parsed.banner),
    website: stringOrUndefined(parsed.website),
    lud16: stringOrUndefined(parsed.lud16),
  };
}

// Memoize the parsed profile per event reference. Kind0Cache hands back stable
// event objects until the next ingest for that (relay, pubkey), so the same
// event reference always yields the same profile reference.
const profileByEvent = new WeakMap<NostrEvent, NostrProfile>();
function eventToProfile(event: NostrEvent | undefined): NostrProfile | null {
  if (!event) return null;
  const existing = profileByEvent.get(event);
  if (existing) return existing;
  const profile = parseEventToProfile(event);
  profileByEvent.set(event, profile);
  return profile;
}

// Lazy pubkey → event index, refreshed when the underlying Kind0Cache version
// bumps. Keeps useCachedNostrProfile snapshots reference-stable so
// useSyncExternalStore can bail out across renders.
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

function getProfileSnapshot(pubkey: string | null): NostrProfile | null {
  if (!pubkey) return null;
  return eventToProfile(getCachedIndex().get(normalizePubkey(pubkey)));
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
    const index = getCachedIndex();
    const result: ProfileCache = {};
    for (const pk of normalizedPubkeys) {
      const profile = eventToProfile(index.get(normalizePubkey(pk)));
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
 * Cache-only profile lookup. Reads from the shared Kind 0 cache via
 * `useSyncExternalStore`, so any new kind 0 event (live ingest or
 * `seedNostrProfile`) re-renders consumers automatically. Safe to use in
 * components rendered outside of `NDKProvider` (e.g. unit tests, isolated UI),
 * and ideal for low-level primitives like `UserAvatar` that simply want to
 * upgrade to the live picture when one is already known.
 */
export function useCachedNostrProfile(pubkey: string | null): NostrProfile | null {
  const getSnapshot = useCallback(() => getProfileSnapshot(pubkey), [pubkey]);
  return useSyncExternalStore(subscribeToKind0Cache, getSnapshot, getSnapshot);
}

/**
 * Seed a profile (e.g. the authenticated user's own NDK profile) into the
 * shared Kind 0 cache. Synthesises a kind 0 event with a present-time
 * timestamp so it wins over any older cached event for the same pubkey; a
 * real signed event arriving later with a newer `created_at` will replace it.
 */
export function seedNostrProfile(profile: NostrProfile): void {
  if (!profile.pubkey) return;
  const metadata: Record<string, string> = {};
  if (profile.name) metadata.name = profile.name;
  if (profile.displayName) metadata.display_name = profile.displayName;
  if (profile.picture) metadata.picture = profile.picture;
  if (profile.about) metadata.about = profile.about;
  if (profile.nip05) metadata.nip05 = profile.nip05;
  if (profile.banner) metadata.banner = profile.banner;
  if (profile.website) metadata.website = profile.website;
  if (profile.lud16) metadata.lud16 = profile.lud16;

  const synthetic: NostrEvent = {
    id: "",
    pubkey: normalizePubkey(profile.pubkey),
    created_at: Math.floor(Date.now() / 1000),
    kind: NostrEventKind.Metadata,
    tags: [],
    content: JSON.stringify(metadata),
    sig: "",
  };
  defaultKind0Cache.save([synthetic]);
}

export function getDefaultAvatarUrl(pubkey: string): string {
  void pubkey;
  return "";
}

// Generate display name from pubkey (fallback)
export function getDefaultDisplayName(pubkey: string): string {
  return formatUserFacingPubkey(pubkey);
}
