export const NOSTR_EVENT_CACHE_STORAGE_KEY = "nodex.nostr-events.cache.v1";
const MAX_CACHED_EVENTS = 500;

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isTagArray(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((entry) => isStringArray(entry));
}

function normalizeCachedEvent(value: unknown): CachedNostrEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Partial<CachedNostrEvent>;
  if (
    typeof event.id !== "string" ||
    typeof event.pubkey !== "string" ||
    typeof event.created_at !== "number" ||
    typeof event.kind !== "number" ||
    !isTagArray(event.tags) ||
    typeof event.content !== "string"
  ) {
    return null;
  }
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: typeof event.sig === "string" ? event.sig : undefined,
    relayUrl: typeof event.relayUrl === "string" ? event.relayUrl : undefined,
  };
}

function dedupeAndSortEvents(events: CachedNostrEvent[]): CachedNostrEvent[] {
  const byId = new Map<string, CachedNostrEvent>();
  for (const event of events) {
    const existing = byId.get(event.id);
    if (!existing || event.created_at >= existing.created_at) {
      byId.set(event.id, event);
    }
  }
  return Array.from(byId.values())
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, MAX_CACHED_EVENTS);
}

export function loadCachedNostrEvents(): CachedNostrEvent[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(NOSTR_EVENT_CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeAndSortEvents(
      parsed
        .map((entry) => normalizeCachedEvent(entry))
        .filter((entry): entry is CachedNostrEvent => Boolean(entry))
    );
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
