import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";

/**
 * Wire-level shape of a Nostr event as it sits in the in-memory ingestion
 * cache. Used only at the ingestion boundary — once an event has been
 * projected into a Post / reactions registry / etc., consumers should read
 * from those projections instead of the raw event.
 */
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

/**
 * Strip a relay URL from each event's relay attribution. Events that have no
 * remaining relays are dropped — they're no longer reachable from any
 * configured relay so the UI should forget about them. Operates on the
 * in-memory React Query cache only; the app no longer persists raw events.
 */
export function removeRelayUrlFromCachedEvents(
  events: CachedNostrEvent[],
  relayUrl: string,
): CachedNostrEvent[] {
  const normalizedRelayUrl = normalizeCachedRelayUrl(relayUrl);
  return events
    .map((event) => {
      const remaining = getRelayUrls(event).filter((url) => url !== normalizedRelayUrl);
      if (remaining.length === 0) return null;
      return {
        ...event,
        relayUrl: remaining[0],
        relayUrls: remaining,
      };
    })
    .filter((event): event is CachedNostrEvent => event !== null);
}
