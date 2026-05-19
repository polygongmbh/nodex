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
