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

interface IngestableKind0Event {
  kind: number;
  pubkey: string;
  created_at?: number;
  content: string;
  relayUrl?: string;
  relayUrls?: string[];
}

const KIND0_CACHE_STORAGE_PREFIX = "nodex.kind0.cache";
const KIND0_CACHE_RELAY_PREFIX = `${KIND0_CACHE_STORAGE_PREFIX}:relay:`;
const KIND0_CACHE_LOCAL_STORAGE_KEY = `${KIND0_CACHE_STORAGE_PREFIX}:local`;
const LOGIN_HISTORY_STORAGE_KEY = "nodex.identity.login-history.v1";
const MAX_CACHED_KIND0_EVENTS = 500;
const MAX_LOGGED_IN_IDENTITIES = 50;
const FLUSH_DEBOUNCE_MS = 750;
const NOTIFY_DEBOUNCE_MS = 64;

function isMetadataEvent(event: Pick<Kind0LikeEvent, "kind" | "pubkey">): boolean {
  return event.kind === NostrEventKind.Metadata && Boolean(event.pubkey);
}

function normalizePubkey(value: string): string {
  return value.trim().toLowerCase();
}

function getRelayStorageKey(relayUrl: string): string {
  return `${KIND0_CACHE_RELAY_PREFIX}${normalizeRelayUrl(relayUrl)}`;
}

/**
 * Per-relay cache of the latest kind-0 event seen for each pubkey. The
 * canonical state is `bucketByStorageKey: Map<storageKey, Map<pubkey, event>>`
 * — ingest is O(1) per relay (one `setIfNewer` call), no sort or slice on
 * the hot path. localStorage holds an array projection that we rebuild
 * only at debounced flush time.
 *
 * Production wires up a single `defaultKind0Cache` instance below; tests
 * construct their own instance to get a clean store without touching
 * shared globals.
 */
export class Kind0Cache {
  private readonly bucketByStorageKey = new Map<string, Map<string, Kind0LikeEvent>>();
  private readonly dirtyStorageKeys = new Set<string>();
  private readonly subscribers = new Set<() => void>();
  private pendingFlushTimer: number | null = null;
  private pendingNotifyTimer: number | null = null;

  private get canUseStorage(): boolean {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  }

  private getBucket(storageKey: string): Map<string, Kind0LikeEvent> {
    let bucket = this.bucketByStorageKey.get(storageKey);
    if (bucket) return bucket;
    bucket = this.loadBucketFromStorage(storageKey);
    this.bucketByStorageKey.set(storageKey, bucket);
    return bucket;
  }

  private loadBucketFromStorage(storageKey: string): Map<string, Kind0LikeEvent> {
    const bucket = new Map<string, Kind0LikeEvent>();
    if (!this.canUseStorage) return bucket;
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      return bucket;
    }
    if (!raw) return bucket;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return bucket;
    }
    if (!Array.isArray(parsed)) return bucket;
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<Kind0LikeEvent>;
      if (
        typeof candidate.pubkey !== "string" ||
        typeof candidate.kind !== "number" ||
        typeof candidate.content !== "string"
      ) {
        continue;
      }
      if (!isMetadataEvent(candidate as Kind0LikeEvent)) continue;
      const normalizedPubkey = normalizePubkey(candidate.pubkey);
      if (!normalizedPubkey) continue;
      const existing = bucket.get(normalizedPubkey);
      if (existing && (existing.created_at || 0) >= (candidate.created_at || 0)) continue;
      bucket.set(normalizedPubkey, {
        kind: candidate.kind,
        pubkey: normalizedPubkey,
        created_at: candidate.created_at,
        content: candidate.content,
      });
    }
    return bucket;
  }

  /** Replace-if-newer into the bucket. Returns true when the bucket changed. */
  private setIfNewer(bucket: Map<string, Kind0LikeEvent>, event: Kind0LikeEvent): boolean {
    if (!isMetadataEvent(event)) return false;
    const normalizedPubkey = normalizePubkey(event.pubkey);
    if (!normalizedPubkey) return false;
    const existing = bucket.get(normalizedPubkey);
    const incomingTs = event.created_at || 0;
    const existingTs = existing?.created_at || 0;
    if (existing) {
      if (existingTs > incomingTs) return false;
      if (existingTs === incomingTs && existing.content === event.content) return false;
    }
    bucket.set(normalizedPubkey, {
      kind: event.kind,
      pubkey: normalizedPubkey,
      created_at: event.created_at,
      content: event.content,
    });
    return true;
  }

  private bucketToArray(bucket: Map<string, Kind0LikeEvent>): Kind0LikeEvent[] {
    if (bucket.size === 0) return [];
    const arr = Array.from(bucket.values());
    if (arr.length <= 1) return arr;
    arr.sort((left, right) => (right.created_at || 0) - (left.created_at || 0));
    if (arr.length > MAX_CACHED_KIND0_EVENTS) arr.length = MAX_CACHED_KIND0_EVENTS;
    return arr;
  }

  private listKnownRelayStorageKeys(): string[] {
    if (!this.canUseStorage) return [];
    const keys = new Set<string>();
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(KIND0_CACHE_RELAY_PREFIX)) continue;
      keys.add(key);
    }
    return Array.from(keys);
  }

  private scheduleFlush(): void {
    if (!this.canUseStorage) return;
    if (typeof window === "undefined") {
      this.flushDirtyToStorage();
      return;
    }
    if (this.pendingFlushTimer !== null) return;
    this.pendingFlushTimer = window.setTimeout(() => {
      this.pendingFlushTimer = null;
      this.flushDirtyToStorage();
    }, FLUSH_DEBOUNCE_MS);
  }

  /** Persist dirty buckets to localStorage now. Idempotent. */
  flushDirtyToStorage(): void {
    if (this.dirtyStorageKeys.size === 0) return;
    for (const storageKey of this.dirtyStorageKeys) {
      const bucket = this.bucketByStorageKey.get(storageKey);
      if (!bucket) continue;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(this.bucketToArray(bucket)));
      } catch {
        // Ignore write failures (quota, etc.) — in-memory state still wins.
      }
    }
    this.dirtyStorageKeys.clear();
  }

  private scheduleNotify(): void {
    if (typeof window === "undefined") {
      this.notifySubscribers();
      return;
    }
    if (this.pendingNotifyTimer !== null) return;
    this.pendingNotifyTimer = window.setTimeout(() => {
      this.pendingNotifyTimer = null;
      this.notifySubscribers();
    }, NOTIFY_DEBOUNCE_MS);
  }

  private notifySubscribers(): void {
    for (const notify of this.subscribers) notify();
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  /**
   * Drop all in-memory state and remove every owned key from localStorage.
   * Used by log-out flows that want to discard cached profiles, and by
   * integration tests that need a known empty cache between cases.
   */
  clear(): void {
    if (this.canUseStorage) {
      for (const storageKey of this.listKnownRelayStorageKeys()) {
        try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
      }
      try { window.localStorage.removeItem(KIND0_CACHE_LOCAL_STORAGE_KEY); } catch { /* ignore */ }
    }
    this.bucketByStorageKey.clear();
    this.dirtyStorageKeys.clear();
    if (this.pendingFlushTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.pendingFlushTimer);
      this.pendingFlushTimer = null;
    }
    if (this.pendingNotifyTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.pendingNotifyTimer);
      this.pendingNotifyTimer = null;
    }
  }

  loadForRelay(relayUrl: string): Kind0LikeEvent[] {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedRelayUrl) return [];
    return this.bucketToArray(this.getBucket(getRelayStorageKey(normalizedRelayUrl)));
  }

  loadAll(): Kind0LikeEvent[] {
    const acc = new Map<string, Kind0LikeEvent>();
    for (const [, event] of this.getBucket(KIND0_CACHE_LOCAL_STORAGE_KEY)) this.setIfNewer(acc, event);
    for (const storageKey of this.listKnownRelayStorageKeys()) {
      for (const [, event] of this.getBucket(storageKey)) this.setIfNewer(acc, event);
    }
    return this.bucketToArray(acc);
  }

  loadForRelayUrls(relayUrls: string[]): Kind0LikeEvent[] {
    const scope = normalizeRelayUrlScope(relayUrls);
    if (scope.length === 0) return [];
    const acc = new Map<string, Kind0LikeEvent>();
    for (const relayUrl of scope) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) continue;
      const bucket = this.getBucket(getRelayStorageKey(normalizedRelayUrl));
      for (const [, event] of bucket) this.setIfNewer(acc, event);
    }
    return this.bucketToArray(acc);
  }

  save(events: Kind0LikeEvent[], relayUrl?: string): boolean {
    if (!this.canUseStorage) return false;
    let storageKey: string;
    if (!relayUrl) {
      storageKey = KIND0_CACHE_LOCAL_STORAGE_KEY;
    } else {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) return false;
      storageKey = getRelayStorageKey(normalizedRelayUrl);
    }
    const bucket = this.getBucket(storageKey);
    let changed = false;
    for (const event of events) {
      if (this.setIfNewer(bucket, event)) changed = true;
    }
    if (changed) {
      this.dirtyStorageKeys.add(storageKey);
      this.scheduleFlush();
      this.notifySubscribers();
    }
    return changed;
  }

  removeRelay(relayUrl: string): void {
    if (!this.canUseStorage) return;
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedRelayUrl) return;
    const storageKey = getRelayStorageKey(normalizedRelayUrl);
    this.bucketByStorageKey.delete(storageKey);
    this.dirtyStorageKeys.delete(storageKey);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore remove failures.
    }
    this.notifySubscribers();
  }

  /**
   * Fold a single kind-0 event into its relay buckets. O(1) per relay,
   * with the subscriber notification debounced so a backfill burst
   * collapses into one render tick downstream.
   */
  ingest(event: IngestableKind0Event): boolean {
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
    let anyChanged = false;
    for (const relayUrl of relayUrls) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) continue;
      const storageKey = getRelayStorageKey(normalizedRelayUrl);
      const bucket = this.getBucket(storageKey);
      if (this.setIfNewer(bucket, payload)) {
        this.dirtyStorageKeys.add(storageKey);
        anyChanged = true;
      }
    }
    if (anyChanged) {
      this.scheduleFlush();
      this.scheduleNotify();
    }
    return anyChanged;
  }
}

export const defaultKind0Cache = new Kind0Cache();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => defaultKind0Cache.flushDirtyToStorage());
  window.addEventListener("pagehide", () => defaultKind0Cache.flushDirtyToStorage());
}

// Free-function adapters around the default cache. Production code uses these
// without knowing about the class; tests construct their own Kind0Cache to
// avoid shared state.

export function loadCachedKind0Events(relayUrl?: string): Kind0LikeEvent[] {
  return relayUrl ? defaultKind0Cache.loadForRelay(relayUrl) : defaultKind0Cache.loadAll();
}

export function loadCachedKind0EventsForRelayUrls(relayUrls: string[]): Kind0LikeEvent[] {
  return defaultKind0Cache.loadForRelayUrls(relayUrls);
}

export function saveCachedKind0Events(events: Kind0LikeEvent[], relayUrl?: string): boolean {
  return defaultKind0Cache.save(events, relayUrl);
}

export function removeCachedKind0EventsByRelayUrl(relayUrl: string): void {
  defaultKind0Cache.removeRelay(relayUrl);
}

export function ingestKind0Event(event: IngestableKind0Event): boolean {
  return defaultKind0Cache.ingest(event);
}

export function subscribeToKind0Cache(callback: () => void): () => void {
  return defaultKind0Cache.subscribe(callback);
}

/**
 * Pure helper: merge two event lists by latest-per-pubkey. Used by the
 * signed-in profile snapshotting path and by callers that operate on event
 * arrays directly. The hot ingest path uses Kind0Cache.ingest instead.
 */
export function mergeKind0EventsWithCache(
  liveEvents: Kind0LikeEvent[],
  cachedEvents: Kind0LikeEvent[]
): Kind0LikeEvent[] {
  const acc = new Map<string, Kind0LikeEvent>();
  for (const event of cachedEvents) foldIntoLatestMap(acc, event);
  for (const event of liveEvents) foldIntoLatestMap(acc, event);
  return Array.from(acc.values()).sort(
    (left, right) => (right.created_at || 0) - (left.created_at || 0),
  );
}

function foldIntoLatestMap(acc: Map<string, Kind0LikeEvent>, event: Kind0LikeEvent): void {
  if (!isMetadataEvent(event)) return;
  const normalizedPubkey = normalizePubkey(event.pubkey);
  if (!normalizedPubkey) return;
  const existing = acc.get(normalizedPubkey);
  if (existing && (existing.created_at || 0) >= (event.created_at || 0)) {
    if ((existing.created_at || 0) > (event.created_at || 0)) return;
    if (existing.content === event.content) return;
  }
  acc.set(normalizedPubkey, { ...event, pubkey: normalizedPubkey });
}

export function rememberCachedKind0Profile(
  pubkey: string,
  profile: CachedProfileSnapshot,
  existingEvents: Kind0LikeEvent[] = loadCachedKind0Events(),
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

  saveCachedKind0Events([snapshotEvent]);
  return loadCachedKind0Events();
}

export function loadLoggedInIdentityPriority(): string[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
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
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(LOGIN_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore local storage write failures.
    }
  }
  return next;
}

function getLatestKind0ByPubkey(events: Kind0LikeEvent[]): Map<string, Kind0LikeEvent> {
  const latestByPubkey = new Map<string, Kind0LikeEvent>();
  for (const event of events) foldIntoLatestMap(latestByPubkey, event);
  return latestByPubkey;
}

function resolveKind0EventForPubkey(
  pubkey: string,
  selectedLatestByPubkey: Map<string, Kind0LikeEvent>,
  fallbackLatestByPubkey: Map<string, Kind0LikeEvent>,
): Kind0LikeEvent | null {
  const normalizedPubkey = normalizePubkey(pubkey);
  if (!normalizedPubkey) return null;
  return (
    selectedLatestByPubkey.get(normalizedPubkey) ||
    fallbackLatestByPubkey.get(normalizedPubkey) ||
    null
  );
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
