import type { SelectablePerson } from "@/types/person";
import { normalizeRelayUrl, normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
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

const KIND0_CACHE_STORAGE_PREFIX = "nodex.kind0.cache";
const KIND0_CACHE_RELAY_PREFIX = `${KIND0_CACHE_STORAGE_PREFIX}:relay:`;
const KIND0_CACHE_LOCAL_STORAGE_KEY = `${KIND0_CACHE_STORAGE_PREFIX}:local`;
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
  return `${KIND0_CACHE_RELAY_PREFIX}${normalizeRelayUrl(relayUrl)}`;
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

// In-memory mirror of the per-relay kind 0 cache. Reads come from here;
// localStorage is the cold-start source and the on-page-unload sink.
// Without this, every kind 0 event during backfill triggered a synchronous
// read + JSON parse + sort + JSON stringify + write, blocking the main
// thread for hundreds of ms across a typical relay backfill.
const kind0InMemoryByStorageKey = new Map<string, Kind0LikeEvent[]>();
const dirtyStorageKeys = new Set<string>();
let pendingFlushTimer: number | null = null;
const FLUSH_DEBOUNCE_MS = 750;

function ensureLoaded(storageKey: string): Kind0LikeEvent[] {
  const memo = kind0InMemoryByStorageKey.get(storageKey);
  if (memo) return memo;
  const loaded = readStoredKind0Events(storageKey);
  kind0InMemoryByStorageKey.set(storageKey, loaded);
  return loaded;
}

function scheduleFlushToStorage(): void {
  if (!canUseStorage()) return;
  if (pendingFlushTimer !== null) return;
  if (typeof window === "undefined") {
    flushDirtyStorageKeys();
    return;
  }
  pendingFlushTimer = window.setTimeout(() => {
    pendingFlushTimer = null;
    flushDirtyStorageKeys();
  }, FLUSH_DEBOUNCE_MS);
}

function flushDirtyStorageKeys(): void {
  for (const storageKey of dirtyStorageKeys) {
    const events = kind0InMemoryByStorageKey.get(storageKey);
    if (!events) continue;
    writeStoredKind0Events(storageKey, events);
  }
  dirtyStorageKeys.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushDirtyStorageKeys);
  window.addEventListener("pagehide", flushDirtyStorageKeys);
}

export function loadCachedKind0Events(relayUrl?: string): Kind0LikeEvent[] {
  if (!canUseStorage()) return [];
  if (relayUrl) {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedRelayUrl) return [];
    return ensureLoaded(getRelayStorageKey(normalizedRelayUrl));
  }

  return mergeKind0EventLists(
    ensureLoaded(KIND0_CACHE_LOCAL_STORAGE_KEY),
    ...listKnownRelayStorageKeys().map((storageKey) => ensureLoaded(storageKey))
  );
}

export function loadCachedKind0EventsForRelayUrls(relayUrls: string[]): Kind0LikeEvent[] {
  return mergeKind0EventLists(
    ...normalizeRelayUrlScope(relayUrls).map((relayUrl) => loadCachedKind0Events(relayUrl))
  );
}

function applyKind0CacheUpdate(storageKey: string, events: Kind0LikeEvent[]): boolean {
  const merged = mergeKind0EventLists(events);
  const previous = kind0InMemoryByStorageKey.get(storageKey);
  if (previous && areKind0EventListsShallowEqual(previous, merged)) return false;
  kind0InMemoryByStorageKey.set(storageKey, merged);
  dirtyStorageKeys.add(storageKey);
  scheduleFlushToStorage();
  return true;
}

function areKind0EventListsShallowEqual(a: Kind0LikeEvent[], b: Kind0LikeEvent[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left.pubkey !== right.pubkey) return false;
    if ((left.created_at || 0) !== (right.created_at || 0)) return false;
    if (left.content !== right.content) return false;
  }
  return true;
}

export function saveCachedKind0Events(events: Kind0LikeEvent[], relayUrl?: string): boolean {
  if (!canUseStorage()) return false;
  let storageKey: string;
  if (!relayUrl) {
    storageKey = KIND0_CACHE_LOCAL_STORAGE_KEY;
  } else {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedRelayUrl) return false;
    storageKey = getRelayStorageKey(normalizedRelayUrl);
  }
  // Make sure any pending per-event ingest for this bucket is folded in
  // before we apply this bulk update, so we don't lose buffered events.
  flushPendingKind0ForStorageKey(storageKey);
  const changed = applyKind0CacheUpdate(storageKey, events);
  if (changed) notifyKind0Subscribers();
  return changed;
}

export function removeCachedKind0EventsByRelayUrl(relayUrl: string): void {
  if (!canUseStorage()) return;
  const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
  if (!normalizedRelayUrl) return;
  const storageKey = getRelayStorageKey(normalizedRelayUrl);
  kind0InMemoryByStorageKey.delete(storageKey);
  dirtyStorageKeys.delete(storageKey);
  pendingKind0ByStorageKey.delete(storageKey);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore remove failures.
  }
  notifyKind0Subscribers();
}

// Tiny pub-sub so hooks that read the kind 0 cache can re-read on writes
// from anywhere (the subscription dispatcher, the signed-in user's profile
// sync, or per-relay disconnect cleanup) without each writer threading a
// cache-revision counter back to them.
const kind0Subscribers = new Set<() => void>();

function notifyKind0Subscribers(): void {
  for (const notify of kind0Subscribers) notify();
}

export function subscribeToKind0Cache(callback: () => void): () => void {
  kind0Subscribers.add(callback);
  return () => { kind0Subscribers.delete(callback); };
}

interface IngestableKind0Event {
  kind: number;
  pubkey: string;
  created_at?: number;
  content: string;
  relayUrl?: string;
  relayUrls?: string[];
}

// Buffer for per-event ingest. The dispatcher fires once per kind 0 event
// it sees on the wire; running the full merge/sort/slice + cross-relay
// reread per event during a backfill burst was allocating ~10 large arrays
// per event (the 3.5.0 path batched into a single useEffect per render).
// We buffer here and drain on a short debounce, collapsing N events × M
// relays into one merge per relay bucket.
const pendingKind0ByStorageKey = new Map<string, Kind0LikeEvent[]>();
let pendingKind0FlushTimer: number | null = null;
const PENDING_KIND0_FLUSH_DELAY_MS = 64;

function schedulePendingKind0Flush(): void {
  if (pendingKind0ByStorageKey.size === 0) return;
  if (typeof window === "undefined") {
    flushAllPendingKind0();
    return;
  }
  if (pendingKind0FlushTimer !== null) return;
  pendingKind0FlushTimer = window.setTimeout(() => {
    pendingKind0FlushTimer = null;
    flushAllPendingKind0();
  }, PENDING_KIND0_FLUSH_DELAY_MS);
}

function flushPendingKind0ForStorageKey(storageKey: string): boolean {
  const pending = pendingKind0ByStorageKey.get(storageKey);
  if (!pending || pending.length === 0) return false;
  pendingKind0ByStorageKey.delete(storageKey);
  const existing = ensureLoaded(storageKey);
  const merged = mergeKind0EventLists(existing, pending);
  if (areKind0EventListsShallowEqual(existing, merged)) return false;
  kind0InMemoryByStorageKey.set(storageKey, merged);
  dirtyStorageKeys.add(storageKey);
  return true;
}

function flushAllPendingKind0(): void {
  if (pendingKind0ByStorageKey.size === 0) return;
  let anyChanged = false;
  for (const storageKey of Array.from(pendingKind0ByStorageKey.keys())) {
    if (flushPendingKind0ForStorageKey(storageKey)) anyChanged = true;
  }
  if (anyChanged) {
    scheduleFlushToStorage();
    notifyKind0Subscribers();
  }
}

if (typeof window !== "undefined") {
  // Ensure buffered events are persisted on page unload.
  window.addEventListener("beforeunload", flushAllPendingKind0);
  window.addEventListener("pagehide", flushAllPendingKind0);
}

/**
 * Buffer a single kind-0 event for ingest. Multiple events land in
 * per-relay-bucket queues and a debounced flush folds the whole burst into
 * the in-memory mirror with a single merge per bucket. Returns true when
 * the event was accepted into the queue (false when filtered out as stale
 * or non-metadata).
 */
export function ingestKind0Event(event: IngestableKind0Event): boolean {
  if (!isMetadataEvent(event)) return false;
  const relayUrls = [
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (relayUrls.length === 0) return false;
  const payload: Kind0LikeEvent = {
    kind: event.kind,
    pubkey: event.pubkey,
    created_at: event.created_at,
    content: event.content,
  };
  const normalizedIncomingPubkey = normalizePubkey(payload.pubkey);
  let buffered = false;
  for (const relayUrl of relayUrls) {
    const storageKey = getRelayStorageKey(relayUrl);
    // Dedup against currently-applied state: if the bucket already has this
    // pubkey at an equal-or-newer timestamp with identical content, drop.
    const existing = ensureLoaded(storageKey);
    const existingForPubkey = existing.find(
      (entry) => normalizePubkey(entry.pubkey) === normalizedIncomingPubkey
    );
    if (
      existingForPubkey &&
      (existingForPubkey.created_at || 0) >= (payload.created_at || 0) &&
      existingForPubkey.content === payload.content
    ) {
      continue;
    }
    // Dedup against another pending event for the same pubkey within the
    // same flush window: keep the newer payload. Bounds the pending bucket
    // by unique pubkeys, not by event volume.
    let pending = pendingKind0ByStorageKey.get(storageKey);
    if (!pending) {
      pending = [];
      pendingKind0ByStorageKey.set(storageKey, pending);
    }
    const pendingIdx = pending.findIndex(
      (entry) => normalizePubkey(entry.pubkey) === normalizedIncomingPubkey
    );
    if (pendingIdx >= 0) {
      const previous = pending[pendingIdx];
      if ((previous.created_at || 0) >= (payload.created_at || 0)) continue;
      pending[pendingIdx] = payload;
    } else {
      pending.push(payload);
    }
    buffered = true;
  }
  if (buffered) schedulePendingKind0Flush();
  return buffered;
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
  previousPeople: SelectablePerson[],
  options?: { prioritizedPubkeys?: string[] }
): SelectablePerson[] {
  const previousSelection = new Map(previousPeople.map((person) => [normalizePubkey(person.pubkey), person.isSelected]));
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
      pubkey,
      name,
      displayName,
      nip05: parsed.nip05?.trim().toLowerCase(),
      about: parsed.about?.trim(),
      avatar: parsed.picture,
      isSelected: previousSelection.get(pubkey) || false,
    } satisfies SelectablePerson;
  });

  return people.sort((a, b) => {
    const aPriority = priorityLookup.get(normalizePubkey(a.pubkey));
    const bPriority = priorityLookup.get(normalizePubkey(b.pubkey));
    if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
    if (aPriority !== undefined) return -1;
    if (bPriority !== undefined) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}
