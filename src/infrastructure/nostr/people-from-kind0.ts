import type { SelectablePerson } from "@/types/person";
import { normalizeRelayUrl, normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { NostrEventKind, type NostrEvent, type NostrEventWithRelay } from "@/lib/nostr/types";
import { parseKind0Content } from "./profile-metadata";
import { registerMemdiagStore } from "@/lib/memdiag";
import {
  isBatchingNotifications,
  registerStoreFlusher,
} from "@/lib/store-batch";

const KIND0_CACHE_STORAGE_PREFIX = "nodex.kind0.cache";
const KIND0_CACHE_RELAY_PREFIX = `${KIND0_CACHE_STORAGE_PREFIX}:relay:`;
const KIND0_CACHE_LOCAL_STORAGE_KEY = `${KIND0_CACHE_STORAGE_PREFIX}:local`;
const MAX_CACHED_KIND0_EVENTS = 500;

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
  private readonly bucketByStorageKey = new Map<string, Map<string, NostrEvent>>();
  private readonly dirtyStorageKeys = new Set<string>();
  private readonly subscribers = new Set<() => void>();
  // Set when notifySubscribers was deferred while store-batch is active;
  // cleared by flushBatchedNotify (registered as a store-batch flusher) which
  // then fans the notification out together with the other batched stores.
  private batchedNotifyPending = false;
  /** Monotonically-incrementing change counter. Consumers can read this via
   * useSyncExternalStore to re-derive scope-filtered projections on any
   * cache change without keeping a parallel state copy. */
  private versionCounter = 0;
  getVersion(): number { return this.versionCounter; }

  private get canUseStorage(): boolean {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  }

  private getBucket(storageKey: string): Map<string, NostrEvent> {
    let bucket = this.bucketByStorageKey.get(storageKey);
    if (bucket) return bucket;
    bucket = this.loadBucketFromStorage(storageKey);
    this.bucketByStorageKey.set(storageKey, bucket);
    return bucket;
  }

  /**
   * Load a bucket from localStorage. The cache format is whatever we last
   * wrote — we don't migrate legacy shapes; an unparseable bucket starts
   * empty and the next live ingest backfills it.
   */
  private loadBucketFromStorage(storageKey: string): Map<string, NostrEvent> {
    const bucket = new Map<string, NostrEvent>();
    if (!this.canUseStorage) return bucket;
    let parsed: unknown;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return bucket;
      parsed = JSON.parse(raw);
    } catch {
      return bucket;
    }
    if (!Array.isArray(parsed)) return bucket;
    for (const event of parsed as NostrEvent[]) {
      this.setIfNewer(bucket, event);
    }
    return bucket;
  }

  /** Replace-if-newer into the bucket. Returns true when the bucket changed. */
  private setIfNewer(bucket: Map<string, NostrEvent>, event: NostrEvent): boolean {
    if (event.kind !== NostrEventKind.Metadata) return false;
    const normalizedPubkey = normalizePubkey(event.pubkey);
    const existing = bucket.get(normalizedPubkey);
    if (existing) {
      if (existing.created_at > event.created_at) return false;
      if (existing.created_at === event.created_at && existing.content === event.content) return false;
    }
    bucket.set(normalizedPubkey, event.pubkey === normalizedPubkey ? event : { ...event, pubkey: normalizedPubkey });
    return true;
  }

  private bucketToArray(bucket: Map<string, NostrEvent>): NostrEvent[] {
    if (bucket.size === 0) return [];
    const arr = Array.from(bucket.values());
    if (arr.length <= 1) return arr;
    arr.sort((left, right) => (right.created_at || 0) - (left.created_at || 0));
    if (arr.length > MAX_CACHED_KIND0_EVENTS) arr.length = MAX_CACHED_KIND0_EVENTS;
    return arr;
  }

  private listKnownRelayStorageKeys(): string[] {
    const keys = new Set<string>();
    if (this.canUseStorage) {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(KIND0_CACHE_RELAY_PREFIX)) continue;
        keys.add(key);
      }
    }
    // In-memory buckets may not be persisted yet (writes are deferred to
    // tab-hide / pagehide), so include them too — otherwise loadAll()
    // misses freshly-ingested events between ingest and shutdown.
    for (const key of this.bucketByStorageKey.keys()) {
      if (key.startsWith(KIND0_CACHE_RELAY_PREFIX)) keys.add(key);
    }
    return Array.from(keys);
  }

  /**
   * Persist dirty buckets to localStorage now. Idempotent. Caller-driven —
   * fired on tab-hide / pagehide / beforeunload only (see the listeners on
   * `defaultKind0Cache` below). Same policy as `posts-cache`: keep the hot
   * path allocation-free and don't compete with the router drain for
   * main-thread time.
   */
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

  private maybeNotify(): void {
    // While the router drain is in flight, defer to the shared store-batch
    // flush so kind-0 wake-ups don't bypass the suppression and re-render
    // useKind0People mid-hydration. Outside the drain, fan out immediately —
    // posts-cache and the other consumers do the same and there is no
    // longer a per-cache debounce on this path.
    if (isBatchingNotifications()) {
      this.batchedNotifyPending = true;
      return;
    }
    this.notifySubscribers();
  }

  /** Called by store-batch's flusher registration on the default instance. */
  flushBatchedNotify(): boolean {
    if (!this.batchedNotifyPending) return false;
    this.batchedNotifyPending = false;
    this.notifySubscribers();
    return true;
  }

  private notifySubscribers(): void {
    this.versionCounter += 1;
    for (const notify of this.subscribers) notify();
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  /**
   * Drop all in-memory state and remove every owned key from localStorage —
   * the cache-layer equivalent of localStorage.clear(). Used by integration
   * tests that exercise the default singleton, and available for an
   * explicit "clear cached profiles" maintenance action.
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
    this.batchedNotifyPending = false;
  }

  loadForRelay(relayUrl: string): NostrEvent[] {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedRelayUrl) return [];
    return this.bucketToArray(this.getBucket(getRelayStorageKey(normalizedRelayUrl)));
  }

  loadAll(): NostrEvent[] {
    const acc = new Map<string, NostrEvent>();
    for (const [, event] of this.getBucket(KIND0_CACHE_LOCAL_STORAGE_KEY)) this.setIfNewer(acc, event);
    for (const storageKey of this.listKnownRelayStorageKeys()) {
      for (const [, event] of this.getBucket(storageKey)) this.setIfNewer(acc, event);
    }
    return this.bucketToArray(acc);
  }

  loadForRelayUrls(relayUrls: string[]): NostrEvent[] {
    const scope = normalizeRelayUrlScope(relayUrls);
    if (scope.length === 0) return [];
    const acc = new Map<string, NostrEvent>();
    for (const relayUrl of scope) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) continue;
      const bucket = this.getBucket(getRelayStorageKey(normalizedRelayUrl));
      for (const [, event] of bucket) this.setIfNewer(acc, event);
    }
    return this.bucketToArray(acc);
  }

  save(events: NostrEvent[], relayUrl?: string): boolean {
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
      this.maybeNotify();
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
   * Fold a kind-0 event into each relay bucket it was seen on. Per-relay
   * work is O(1) (a Map.set with a created_at comparison). Writes to
   * localStorage are deferred to shutdown; subscriber notification routes
   * through store-batch so a hydration burst collapses into a single
   * downstream render at the end of each router drain chunk.
   */
  ingest(event: NostrEventWithRelay): boolean {
    if (event.kind !== NostrEventKind.Metadata) return false;
    if (event.relayUrls.length === 0) return false;
    let anyChanged = false;
    for (const relayUrl of event.relayUrls) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) continue;
      const storageKey = getRelayStorageKey(normalizedRelayUrl);
      const bucket = this.getBucket(storageKey);
      if (this.setIfNewer(bucket, event)) {
        this.dirtyStorageKeys.add(storageKey);
        anyChanged = true;
      }
    }
    if (anyChanged) {
      this.maybeNotify();
    }
    return anyChanged;
  }
}

export const defaultKind0Cache = new Kind0Cache();
registerStoreFlusher(() => defaultKind0Cache.flushBatchedNotify());

if (typeof window !== "undefined") {
  // Match useCachedPosts' shutdown policy: flush on tab-hide as well as
  // pagehide / unload so mobile tab-switches don't skip persistence.
  const flushIfHidden = () => {
    if (document.visibilityState === "hidden") defaultKind0Cache.flushDirtyToStorage();
  };
  document.addEventListener("visibilitychange", flushIfHidden);
  window.addEventListener("pagehide", () => defaultKind0Cache.flushDirtyToStorage());
  window.addEventListener("beforeunload", () => defaultKind0Cache.flushDirtyToStorage());
}

if (import.meta.env.DEV) {
  registerMemdiagStore("kind0-cache", () => {
    const buckets = (defaultKind0Cache as unknown as {
      bucketByStorageKey: Map<string, Map<string, NostrEvent>>;
      dirtyStorageKeys: Set<string>;
      subscribers: Set<() => void>;
    });
    let total = 0;
    let largest = 0;
    for (const bucket of buckets.bucketByStorageKey.values()) {
      total += bucket.size;
      if (bucket.size > largest) largest = bucket.size;
    }
    return {
      size: total,
      extras: {
        buckets: buckets.bucketByStorageKey.size,
        largestBucket: largest,
        dirtyBuckets: buckets.dirtyStorageKeys.size,
        subscribers: buckets.subscribers.size,
      },
    };
  });
}

// Free-function adapters around the default cache. Production code uses these
// without knowing about the class; tests construct their own Kind0Cache to
// avoid shared state.

export function loadCachedKind0Events(relayUrl?: string): NostrEvent[] {
  return relayUrl ? defaultKind0Cache.loadForRelay(relayUrl) : defaultKind0Cache.loadAll();
}

export function loadCachedKind0EventsForRelayUrls(relayUrls: string[]): NostrEvent[] {
  return defaultKind0Cache.loadForRelayUrls(relayUrls);
}

export function saveCachedKind0Events(events: NostrEvent[], relayUrl?: string): boolean {
  return defaultKind0Cache.save(events, relayUrl);
}

export function removeCachedKind0EventsByRelayUrl(relayUrl: string): void {
  defaultKind0Cache.removeRelay(relayUrl);
}

export function ingestKind0Event(event: NostrEventWithRelay): boolean {
  return defaultKind0Cache.ingest(event);
}

export function subscribeToKind0Cache(callback: () => void): () => void {
  return defaultKind0Cache.subscribe(callback);
}

export function getKind0CacheVersion(): number {
  return defaultKind0Cache.getVersion();
}

/**
 * Pure helper: merge two event lists by latest-per-pubkey. Used by the
 * signed-in profile snapshotting path and by callers that operate on event
 * arrays directly. The hot ingest path uses Kind0Cache.ingest instead.
 */
export function mergeKind0EventsWithCache(
  liveEvents: NostrEvent[],
  cachedEvents: NostrEvent[]
): NostrEvent[] {
  const acc = new Map<string, NostrEvent>();
  for (const event of cachedEvents) foldIntoLatestMap(acc, event);
  for (const event of liveEvents) foldIntoLatestMap(acc, event);
  return Array.from(acc.values()).sort(
    (left, right) => (right.created_at || 0) - (left.created_at || 0),
  );
}

function foldIntoLatestMap(acc: Map<string, NostrEvent>, event: NostrEvent): void {
  if (event.kind !== NostrEventKind.Metadata) return;
  const normalizedPubkey = normalizePubkey(event.pubkey);
  const existing = acc.get(normalizedPubkey);
  if (existing) {
    if (existing.created_at > event.created_at) return;
    if (existing.created_at === event.created_at && existing.content === event.content) return;
  }
  acc.set(normalizedPubkey, event.pubkey === normalizedPubkey ? event : { ...event, pubkey: normalizedPubkey });
}

function getLatestKind0ByPubkey(events: NostrEvent[]): Map<string, NostrEvent> {
  const latestByPubkey = new Map<string, NostrEvent>();
  for (const event of events) foldIntoLatestMap(latestByPubkey, event);
  return latestByPubkey;
}

function resolveKind0EventForPubkey(
  pubkey: string,
  selectedLatestByPubkey: Map<string, NostrEvent>,
  fallbackLatestByPubkey: Map<string, NostrEvent>,
): NostrEvent | null {
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
  selectedEvents: NostrEvent[],
  fallbackEvents: NostrEvent[],
  previousPeople: SelectablePerson[],
): SelectablePerson[] {
  const previousSelection = new Map(previousPeople.map((person) => [normalizePubkey(person.pubkey), person.isSelected]));

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

  return people.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
