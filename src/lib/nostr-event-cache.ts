import { z } from "zod";

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
  const byId = new Map<string, CachedNostrEvent>();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (!existing || event.created_at >= existing.created_at) {
      byId.set(event.id, event);
    }
  }
  return Array.from(byId.values())
    .sort((left, right) => right.created_at - left.created_at);
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
