import { z } from "zod";
import { getReplaceableEventKey, isParameterizedReplaceableKind } from "@/infrastructure/nostr/replaceable-events";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";

export const NOSTR_EVENT_CACHE_STORAGE_KEY = "nodex.nostr-events.cache";
export const NOSTR_EVENT_CACHE_SCOPE_PREFIX = `${NOSTR_EVENT_CACHE_STORAGE_KEY}:scope:`;
export const NOSTR_EVENT_CACHE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const NOSTR_EVENT_CACHE_MAX_EVENTS_PER_SCOPE = 500;

export interface CachedNostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
  relayUrl?: string;
  relayUrls?: string[];
}

export const EMPTY_RELAY_SCOPE_KEY = "none";
export const ALL_RELAYS_SCOPE_KEY = "all";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeCacheScope(scopeKey?: string): string {
  const normalized = (scopeKey || "").trim();
  return normalized || "global";
}

function getScopedCacheStorageKey(scopeKey?: string): string {
  const normalizedScope = normalizeCacheScope(scopeKey);
  if (normalizedScope === "global") {
    return NOSTR_EVENT_CACHE_STORAGE_KEY;
  }
  return `${NOSTR_EVENT_CACHE_SCOPE_PREFIX}${normalizedScope}`;
}

function listKnownCacheStorageKeys(): string[] {
  if (!hasLocalStorage()) return [];
  const keys = new Set<string>([NOSTR_EVENT_CACHE_STORAGE_KEY]);
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key.startsWith(NOSTR_EVENT_CACHE_SCOPE_PREFIX)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function extractScopeFromStorageKey(storageKey: string): string {
  if (storageKey === NOSTR_EVENT_CACHE_STORAGE_KEY) return "global";
  if (!storageKey.startsWith(NOSTR_EVENT_CACHE_SCOPE_PREFIX)) return "";
  return storageKey.slice(NOSTR_EVENT_CACHE_SCOPE_PREFIX.length).trim() || "global";
}

function loadCachedEventsFromStorageKey(storageKey: string): CachedNostrEvent[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = cachedNostrEventsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return applyRetentionLimits(parsed.data as CachedNostrEvent[]);
  } catch {
    return [];
  }
}


const cachedNostrEventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().optional(),
  relayUrl: z.string().optional(),
  relayUrls: z.array(z.string()).optional(),
});
const cachedNostrEventsSchema = z.array(cachedNostrEventSchema);

export const normalizeCachedRelayUrl = normalizeRelayUrl;

function getRelayUrls(event: CachedNostrEvent): string[] {
  const urls = [
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]
    .map(normalizeCachedRelayUrl)
    .filter((url) => Boolean(url));
  return Array.from(new Set(urls)).sort();
}

function withNormalizedRelayUrls(event: CachedNostrEvent): CachedNostrEvent {
  const relayUrls = getRelayUrls(event);
  return {
    ...event,
    relayUrl: relayUrls[0],
    relayUrls: relayUrls.length > 0 ? relayUrls : undefined,
  };
}

function dedupeAndSortEvents(events: CachedNostrEvent[]): CachedNostrEvent[] {
  const filtered = events
    .map(withNormalizedRelayUrls)
    .filter((event) => {
    if (!isParameterizedReplaceableKind(event.kind)) return true;
    // Parameterized replaceable events without "d" are invalid.
    return getReplaceableEventKey(event) !== null;
  });
  const byId = new Map<string, CachedNostrEvent>();
  for (const event of filtered) {
    const existing = byId.get(event.id);
    if (!existing) {
      byId.set(event.id, event);
      continue;
    }
    const mergedRelayUrls = Array.from(new Set([...getRelayUrls(existing), ...getRelayUrls(event)])).sort();
    const winner = event.created_at >= existing.created_at ? event : existing;
    byId.set(event.id, {
      ...winner,
      relayUrl: mergedRelayUrls[0],
      relayUrls: mergedRelayUrls.length > 0 ? mergedRelayUrls : undefined,
    });
  }
  const byReplaceable = new Map<string, CachedNostrEvent>();
  for (const event of byId.values()) {
    if (event.kind === 0) {
      const relayScope = getRelayUrls(event).join("|") || "unscoped";
      const existing = byReplaceable.get(`${event.kind}:${event.pubkey}:${relayScope}`);
      if (
        !existing ||
        event.created_at > existing.created_at ||
        (event.created_at === existing.created_at && event.id > existing.id)
      ) {
        byReplaceable.set(`${event.kind}:${event.pubkey}:${relayScope}`, event);
      }
      continue;
    }
    const replaceableKey = getReplaceableEventKey(event);
    if (!replaceableKey) continue;
    const existing = byReplaceable.get(replaceableKey);
    if (
      !existing ||
      event.created_at > existing.created_at ||
      (event.created_at === existing.created_at && event.id > existing.id)
    ) {
      byReplaceable.set(replaceableKey, event);
    }
  }

  const nonReplaceable = Array.from(byId.values()).filter((event) => getReplaceableEventKey(event) === null);
  const replaceable = Array.from(byReplaceable.values());

  return [...nonReplaceable, ...replaceable].sort((left, right) => right.created_at - left.created_at);
}

function applyRetentionLimits(events: CachedNostrEvent[], nowSeconds = Math.floor(Date.now() / 1000)): CachedNostrEvent[] {
  const deduped = dedupeAndSortEvents(events);
  const cutoff = nowSeconds - NOSTR_EVENT_CACHE_RETENTION_SECONDS;
  return deduped
    .filter((event) => event.created_at >= cutoff)
    .slice(0, NOSTR_EVENT_CACHE_MAX_EVENTS_PER_SCOPE);
}

function removeScopeCache(storageKey: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore remove failures and continue best-effort pruning.
  }
}

export function loadCachedNostrEvents(scopeKey?: string): CachedNostrEvent[] {
  if (!hasLocalStorage()) return [];
  try {
    const normalizedScope = normalizeCacheScope(scopeKey);
    if (normalizedScope === EMPTY_RELAY_SCOPE_KEY) return [];
    return loadCachedEventsFromStorageKey(getScopedCacheStorageKey(normalizedScope));
  } catch {
    return [];
  }
}

export function loadCachedNostrEventsForBootstrap(scopeKey?: string): CachedNostrEvent[] {
  const normalizedScope = normalizeCacheScope(scopeKey);
  if (normalizedScope === EMPTY_RELAY_SCOPE_KEY) return [];

  const primaryScopeEvents = loadCachedNostrEvents(normalizedScope);
  if (primaryScopeEvents.length > 0) return primaryScopeEvents;

  const combined = listKnownCacheStorageKeys().flatMap((storageKey) =>
    loadCachedEventsFromStorageKey(storageKey)
  );
  return applyRetentionLimits(combined);
}

export function saveCachedNostrEvents(events: CachedNostrEvent[], scopeKey?: string): void {
  if (!hasLocalStorage()) return;
  const normalizedScope = normalizeCacheScope(scopeKey);
  if (normalizedScope === EMPTY_RELAY_SCOPE_KEY) return;
  const storageKey = getScopedCacheStorageKey(normalizedScope);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const normalizedEvents = applyRetentionLimits(events, nowSeconds);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizedEvents));
  } catch {
    console.warn("Failed to persist nostr event cache", {
      scope: normalizedScope,
      eventCount: normalizedEvents.length,
    });
  }
}

export function removeCachedNostrEventById(eventId: string): void {
  if (!hasLocalStorage()) return;
  const normalizedId = eventId.trim();
  if (!normalizedId) return;
  const storageKeys = listKnownCacheStorageKeys();
  storageKeys.forEach((storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = cachedNostrEventsSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return;
      const next = dedupeAndSortEvents(parsed.data as CachedNostrEvent[]).filter((event) => event.id !== normalizedId);
      if (next.length === parsed.data.length) return;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore malformed cache payloads and continue.
    }
  });
}

export function removeRelayUrlFromCachedEvents(
  events: CachedNostrEvent[],
  relayUrl: string
): CachedNostrEvent[] {
  const normalizedRelayUrl = normalizeCachedRelayUrl(relayUrl);
  if (!normalizedRelayUrl) {
    return dedupeAndSortEvents(events).filter((event) => getRelayUrls(event).length > 0);
  }

  return dedupeAndSortEvents(events)
    .map((event) => {
      const remainingRelayUrls = getRelayUrls(event).filter((url) => url !== normalizedRelayUrl);
      if (remainingRelayUrls.length === 0) return null;
      return {
        ...event,
        relayUrl: remainingRelayUrls[0],
        relayUrls: remainingRelayUrls,
      } as CachedNostrEvent;
    })
    .filter((event): event is CachedNostrEvent => event !== null);
}

export function removeCachedNostrEventsByRelayUrl(relayUrl: string): void {
  if (!hasLocalStorage()) return;
  const storageKeys = listKnownCacheStorageKeys();
  storageKeys.forEach((storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = cachedNostrEventsSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return;
      const next = removeRelayUrlFromCachedEvents(parsed.data as CachedNostrEvent[], relayUrl);
      if (next.length === parsed.data.length) {
        const currentIds = (parsed.data as CachedNostrEvent[]).map((event) => `${event.id}:${getRelayUrls(event).join(",")}`);
        const nextIds = next.map((event) => `${event.id}:${getRelayUrls(event).join(",")}`);
        if (currentIds.every((value, index) => nextIds[index] === value)) return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore malformed cache payloads and continue.
    }
  });
}

export function removeCachedNostrEventScopesByRelayId(relayId: string): void {
  if (!hasLocalStorage()) return;
  const normalizedRelayId = relayId.trim().toLowerCase();
  if (!normalizedRelayId) return;

  listKnownCacheStorageKeys().forEach((storageKey) => {
    const scope = extractScopeFromStorageKey(storageKey);
    if (!scope || scope === "global" || scope === ALL_RELAYS_SCOPE_KEY || scope === EMPTY_RELAY_SCOPE_KEY) return;
    const scopeRelayIds = scope.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!scopeRelayIds.includes(normalizedRelayId)) return;
    removeScopeCache(storageKey);
  });
}
