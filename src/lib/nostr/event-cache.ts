import { z } from "zod";
import { getReplaceableEventKey, isParameterizedReplaceableKind } from "@/lib/nostr/replaceable-events";

export const NOSTR_EVENT_CACHE_STORAGE_KEY = "nodex.nostr-events.cache.v1";

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

export function loadCachedNostrEvents(): CachedNostrEvent[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(NOSTR_EVENT_CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = cachedNostrEventsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return dedupeAndSortEvents(parsed.data);
  } catch {
    return [];
  }
}

export function saveCachedNostrEvents(events: CachedNostrEvent[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(
      NOSTR_EVENT_CACHE_STORAGE_KEY,
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
  const existing = loadCachedNostrEvents();
  const next = existing.filter((event) => event.id !== normalizedId);
  if (next.length === existing.length) return;
  saveCachedNostrEvents(next);
}
