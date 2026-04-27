import type { Person } from "@/types/person";
import { normalizeCachedRelayUrl } from "@/infrastructure/nostr/event-cache";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { NostrEventKind } from "@/lib/nostr/types";
import { parseKind0Content } from "./profile-metadata";

export interface Kind0LikeEvent {
  kind: number;
  pubkey: string;
  created_at?: number;
  content: string;
}

interface CachedProfileSnapshot {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

const KIND0_CACHE_STORAGE_PREFIX = "nodex.kind0.cache.v2";
const KIND0_CACHE_RELAY_PREFIX = `${KIND0_CACHE_STORAGE_PREFIX}:relay:`;
const KIND0_CACHE_LOCAL_STORAGE_KEY = `${KIND0_CACHE_STORAGE_PREFIX}:local`;
const LEGACY_KIND0_CACHE_STORAGE_KEY = "nodex.kind0.cache.v1";
const LOGIN_HISTORY_STORAGE_KEY = "nodex.identity.login-history.v1";
const MAX_CACHED_KIND0_EVENTS = 500;
const MAX_LOGGED_IN_IDENTITIES = 50;

function isMetadataEvent(event: Kind0LikeEvent): boolean {
  return event.kind === NostrEventKind.Metadata && Boolean(event.pubkey);
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizePubkey(value: string): string {
  return value.trim().toLowerCase();
}

function getLatestKind0ByPubkey(events: Kind0LikeEvent[]): Map<string, Kind0LikeEvent> {
  const latestByPubkey = new Map<string, Kind0LikeEvent>();
  for (const event of events) {
    if (!isMetadataEvent(event)) continue;
    const normalizedPubkey = normalizePubkey(event.pubkey);
    if (!normalizedPubkey) continue;
    const current = latestByPubkey.get(normalizedPubkey);
    if (
      !current ||
      (event.created_at || 0) > (current.created_at || 0) ||
      ((event.created_at || 0) === (current.created_at || 0) && event.content > current.content)
    ) {
      latestByPubkey.set(normalizedPubkey, {
        ...event,
        pubkey: normalizedPubkey,
      });
    }
  }
  return latestByPubkey;
}

function mergeKind0EventLists(...eventLists: Kind0LikeEvent[][]): Kind0LikeEvent[] {
  return Array.from(getLatestKind0ByPubkey(eventLists.flat()).values())
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, MAX_CACHED_KIND0_EVENTS);
}

function getRelayStorageKey(relayUrl: string): string {
  return `${KIND0_CACHE_RELAY_PREFIX}${normalizeCachedRelayUrl(relayUrl)}`;
}

function listKnownRelayStorageKeys(): string[] {
  if (!canUseStorage()) return [];
  const keys = new Set<string>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(KIND0_CACHE_RELAY_PREFIX)) continue;
    keys.add(key);
  }
  return Array.from(keys);
}

function readStoredKind0Events(storageKey: string): Kind0LikeEvent[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((event): event is Kind0LikeEvent =>
        Boolean(
          event &&
          typeof event === "object" &&
          typeof event.pubkey === "string" &&
          typeof event.kind === "number" &&
          typeof event.content === "string"
        )
      )
      .filter(isMetadataEvent)
      .map((event) => ({
        ...event,
        pubkey: normalizePubkey(event.pubkey),
      }))
      .slice(0, MAX_CACHED_KIND0_EVENTS);
  } catch {
    return [];
  }
}

function writeStoredKind0Events(storageKey: string, events: Kind0LikeEvent[]): boolean {
  if (!canUseStorage()) return false;
  try {
    const serialized = JSON.stringify(mergeKind0EventLists(events));
    const previous = window.localStorage.getItem(storageKey);
    if (previous === serialized) return false;
    window.localStorage.setItem(storageKey, serialized);
    return true;
  } catch {
    // Ignore local storage write failures.
    return false;
  }
}

export function mergeKind0EventsWithCache(
  liveEvents: Kind0LikeEvent[],
  cachedEvents: Kind0LikeEvent[]
): Kind0LikeEvent[] {
  return mergeKind0EventLists(cachedEvents, liveEvents);
}

export function loadCachedKind0Events(relayUrl?: string): Kind0LikeEvent[] {
  if (!canUseStorage()) return [];
  if (relayUrl) {
    const normalizedRelayUrl = normalizeCachedRelayUrl(relayUrl);
    if (!normalizedRelayUrl) return [];
    return readStoredKind0Events(getRelayStorageKey(normalizedRelayUrl));
  }

  return mergeKind0EventLists(
    readStoredKind0Events(LEGACY_KIND0_CACHE_STORAGE_KEY),
    readStoredKind0Events(KIND0_CACHE_LOCAL_STORAGE_KEY),
    ...listKnownRelayStorageKeys().map((storageKey) => readStoredKind0Events(storageKey))
  );
}

export function loadCachedKind0EventsForRelayUrls(relayUrls: string[]): Kind0LikeEvent[] {
  return mergeKind0EventLists(
    ...normalizeRelayUrlScope(relayUrls).map((relayUrl) => loadCachedKind0Events(relayUrl))
  );
}

export function saveCachedKind0Events(events: Kind0LikeEvent[], relayUrl?: string): boolean {
  if (!canUseStorage()) return false;
  if (!relayUrl) {
    return writeStoredKind0Events(KIND0_CACHE_LOCAL_STORAGE_KEY, events);
  }

  const normalizedRelayUrl = normalizeCachedRelayUrl(relayUrl);
  if (!normalizedRelayUrl) return false;
  return writeStoredKind0Events(getRelayStorageKey(normalizedRelayUrl), events);
}

export function removeCachedKind0EventsByRelayUrl(relayUrl: string): void {
  if (!canUseStorage()) return;
  const normalizedRelayUrl = normalizeCachedRelayUrl(relayUrl);
  if (!normalizedRelayUrl) return;
  try {
    window.localStorage.removeItem(getRelayStorageKey(normalizedRelayUrl));
  } catch {
    // Ignore remove failures.
  }
}

function resolveKind0EventForPubkey(
  pubkey: string,
  selectedLatestByPubkey: Map<string, Kind0LikeEvent>,
  fallbackLatestByPubkey: Map<string, Kind0LikeEvent>
): Kind0LikeEvent | null {
  const normalizedPubkey = normalizePubkey(pubkey);
  if (!normalizedPubkey) return null;

  return (
    selectedLatestByPubkey.get(normalizedPubkey) ||
    fallbackLatestByPubkey.get(normalizedPubkey) ||
    null
  );
}

export function rememberCachedKind0Profile(
  pubkey: string,
  profile: CachedProfileSnapshot,
  existingEvents: Kind0LikeEvent[] = readStoredKind0Events(KIND0_CACHE_LOCAL_STORAGE_KEY)
): Kind0LikeEvent[] {
  const normalizedPubkey = normalizePubkey(pubkey);
  if (!normalizedPubkey) return existingEvents;

  const existingEvent = existingEvents.find((event) => normalizePubkey(event.pubkey) === normalizedPubkey);
  const existingProfile = existingEvent ? parseKind0Content(existingEvent.content) : {};

  const merged = {
    name: (profile.name || existingProfile.name || profile.displayName || existingProfile.displayName || normalizedPubkey.slice(0, 8)).trim(),
    displayName: (profile.displayName || existingProfile.displayName || "").trim() || undefined,
    about: (profile.about || existingProfile.about || "").trim() || undefined,
    picture: (profile.picture || existingProfile.picture || "").trim() || undefined,
    nip05: (profile.nip05 || existingProfile.nip05 || "").trim() || undefined,
  };

  const snapshotEvent: Kind0LikeEvent = {
    kind: NostrEventKind.Metadata,
    pubkey: normalizedPubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify(merged),
  };

  const next = mergeKind0EventLists(existingEvents, [snapshotEvent]);
  saveCachedKind0Events(next);
  return next;
}

export function loadLoggedInIdentityPriority(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(LOGIN_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map(normalizePubkey)
      .filter(Boolean)
      .slice(0, MAX_LOGGED_IN_IDENTITIES);
  } catch {
    return [];
  }
}

export function rememberLoggedInIdentity(pubkey: string): string[] {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) return loadLoggedInIdentityPriority();
  const next = [
    normalized,
    ...loadLoggedInIdentityPriority().filter((value) => value !== normalized),
  ].slice(0, MAX_LOGGED_IN_IDENTITIES);
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(LOGIN_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore local storage write failures.
    }
  }
  return next;
}

export function derivePeopleFromKind0Events(
  visiblePubkeys: string[],
  selectedEvents: Kind0LikeEvent[],
  fallbackEvents: Kind0LikeEvent[],
  previousPeople: Person[],
  options?: { prioritizedPubkeys?: string[] }
): Person[] {
  const previousSelection = new Map(previousPeople.map((person) => [normalizePubkey(person.id), person.isSelected]));
  const priorityLookup = new Map(
    (options?.prioritizedPubkeys || [])
      .map((value, index) => [normalizePubkey(value), index] as const)
  );

  const normalizedVisiblePubkeys = Array.from(
    new Set(visiblePubkeys.map((pubkey) => normalizePubkey(pubkey)).filter(Boolean))
  );

  const selectedLatestByPubkey = getLatestKind0ByPubkey(selectedEvents);
  const fallbackLatestByPubkey = getLatestKind0ByPubkey(fallbackEvents);

  const people = normalizedVisiblePubkeys.map((pubkey) => {
    const event = resolveKind0EventForPubkey(pubkey, selectedLatestByPubkey, fallbackLatestByPubkey);
    const parsed = event ? parseKind0Content(event.content) : {};
    const fallbackPubkeyLabel = formatUserFacingPubkey(pubkey);
    const name = (parsed.name || parsed.displayName || fallbackPubkeyLabel).trim();
    const displayName = (parsed.displayName || parsed.name || fallbackPubkeyLabel).trim();

    return {
      id: pubkey,
      name,
      displayName,
      nip05: parsed.nip05?.trim().toLowerCase(),
      about: parsed.about?.trim(),
      avatar: parsed.picture,
      isOnline: true,
      isSelected: previousSelection.get(pubkey) || false,
    } satisfies Person;
  });

  return people.sort((a, b) => {
    const aPriority = priorityLookup.get(normalizePubkey(a.id));
    const bPriority = priorityLookup.get(normalizePubkey(b.id));
    if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
    if (aPriority !== undefined) return -1;
    if (bPriority !== undefined) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}
