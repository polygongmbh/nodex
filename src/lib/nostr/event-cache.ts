import { z } from "zod";
import { getReplaceableEventKey, isParameterizedReplaceableKind } from "@/lib/nostr/replaceable-events";

export const NOSTR_EVENT_CACHE_STORAGE_KEY = "nodex.nostr-events.cache.v1";
export const NOSTR_EVENT_CACHE_SCOPE_PREFIX = `${NOSTR_EVENT_CACHE_STORAGE_KEY}:scope:`;

export interface CachedNostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
  relayUrl?: string;
}

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

const cachedNostrEventSchema: z.ZodType<CachedNostrEvent> = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().optional(),
  relayUrl: z.string().optional(),
});
const cachedNostrEventsSchema = z.array(cachedNostrEventSchema);

function dedupeAndSortEvents(events: CachedNostrEvent[]): CachedNostrEvent[] {
  const filtered = events.filter((event) => {
    if (!isParameterizedReplaceableKind(event.kind)) return true;
    // Parameterized replaceable events without "d" are invalid.
    return getReplaceableEventKey(event) !== null;
  });
  const byId = new Map<string, CachedNostrEvent>();
  for (const event of filtered) {
    const existing = byId.get(event.id);
    if (!existing || event.created_at >= existing.created_at) {
      byId.set(event.id, event);
    }
  }
  const byReplaceable = new Map<string, CachedNostrEvent>();
  for (const event of byId.values()) {
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

export function loadCachedNostrEvents(scopeKey?: string): CachedNostrEvent[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(getScopedCacheStorageKey(scopeKey));
    if (!raw) return [];
    const parsed = cachedNostrEventsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return dedupeAndSortEvents(parsed.data);
  } catch {
    return [];
  }
}

export function saveCachedNostrEvents(events: CachedNostrEvent[], scopeKey?: string): void {
  if (!hasLocalStorage()) return;
  try {
    const storageKey = getScopedCacheStorageKey(scopeKey);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(dedupeAndSortEvents(events))
    );
  } catch {
    // Ignore persistence errors and continue.
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
      const next = dedupeAndSortEvents(parsed.data).filter((event) => event.id !== normalizedId);
      if (next.length === parsed.data.length) return;
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore malformed cache payloads and continue.
    }
  });
}
