import type { Person } from "@/types";
import { parseKind0Content } from "./profile-metadata";
import { NostrEventKind } from "./types";

interface Kind0LikeEvent {
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

const KIND0_CACHE_STORAGE_KEY = "nodex.kind0.cache.v1";
const LOGIN_HISTORY_STORAGE_KEY = "nodex.identity.login-history.v1";
const MAX_CACHED_KIND0_EVENTS = 500;
const MAX_LOGGED_IN_IDENTITIES = 50;

function isMetadataEvent(event: Kind0LikeEvent): boolean {
  return event.kind === NostrEventKind.Metadata && Boolean(event.pubkey);
}

function getLatestKind0ByPubkey(events: Kind0LikeEvent[]): Map<string, Kind0LikeEvent> {
  const latestByPubkey = new Map<string, Kind0LikeEvent>();
  for (const event of events) {
    if (!isMetadataEvent(event)) continue;
    const current = latestByPubkey.get(event.pubkey);
    if (!current || (event.created_at || 0) >= (current.created_at || 0)) {
      latestByPubkey.set(event.pubkey, event);
    }
  }
  return latestByPubkey;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizePubkey(value: string): string {
  return value.trim().toLowerCase();
}

export function mergeKind0EventsWithCache(
  liveEvents: Kind0LikeEvent[],
  cachedEvents: Kind0LikeEvent[]
): Kind0LikeEvent[] {
  const merged = getLatestKind0ByPubkey([...cachedEvents, ...liveEvents]);
  return Array.from(merged.values())
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, MAX_CACHED_KIND0_EVENTS);
}

export function loadCachedKind0Events(): Kind0LikeEvent[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KIND0_CACHE_STORAGE_KEY);
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
      .slice(0, MAX_CACHED_KIND0_EVENTS);
  } catch {
    return [];
  }
}

export function saveCachedKind0Events(events: Kind0LikeEvent[]): void {
  if (!canUseStorage()) return;
  const latestEvents = mergeKind0EventsWithCache(events, []);
  try {
    window.localStorage.setItem(KIND0_CACHE_STORAGE_KEY, JSON.stringify(latestEvents));
  } catch {
    // Ignore local storage write failures.
  }
}

export function rememberCachedKind0Profile(pubkey: string, profile: CachedProfileSnapshot): Kind0LikeEvent[] {
  const normalizedPubkey = normalizePubkey(pubkey);
  if (!normalizedPubkey) return loadCachedKind0Events();

  const cachedEvents = loadCachedKind0Events();
  const existingEvent = cachedEvents.find((event) => normalizePubkey(event.pubkey) === normalizedPubkey);
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

  const next = mergeKind0EventsWithCache([snapshotEvent], cachedEvents);
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
  events: Kind0LikeEvent[],
  previousPeople: Person[],
  options?: { prioritizedPubkeys?: string[] }
): Person[] {
  const previousSelection = new Map(previousPeople.map((person) => [person.id, person.isSelected]));
  const latestByPubkey = getLatestKind0ByPubkey(events);
  const priorityLookup = new Map(
    (options?.prioritizedPubkeys || [])
      .map((value, index) => [normalizePubkey(value), index] as const)
  );

  const people = Array.from(latestByPubkey.entries()).map(([pubkey, event]) => {
    const parsed = parseKind0Content(event.content);
    const name = (parsed.name || parsed.displayName || pubkey.slice(0, 8)).trim();
    const displayName = (parsed.displayName || parsed.name || `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`).trim();

    return {
      id: pubkey,
      name,
      displayName,
      nip05: parsed.nip05?.trim().toLowerCase(),
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
