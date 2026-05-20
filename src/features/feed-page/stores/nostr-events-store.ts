import { useSyncExternalStore } from "react";
import type { NostrEventWithRelay } from "@/lib/nostr/types";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import {
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
} from "@/infrastructure/nostr/replaceable-events";

// Module-level store of raw Nostr events fed by the subscription dispatcher.
// Replaces the react-query-backed central CachedNostrEvent[] array. Each
// downstream concern (post timeline, kind 0 people list, …) reads from here
// via useNostrEvents(); per-concern stores (reactions, presence) ingest from
// the same dispatcher and own their own projections separately.

const eventsById = new Map<string, NostrEventWithRelay>();
const replaceableKeyToId = new Map<string, string>();
const subscribers = new Set<() => void>();
let version = 0;
let cachedFlatArray: NostrEventWithRelay[] = [];
let cachedFlatArrayVersion = -1;

function notifyChange(): void {
  version += 1;
  for (const subscriber of subscribers) subscriber();
}

function getRelayUrls(event: { relayUrl?: string; relayUrls?: string[] }): string[] {
  return normalizeRelayUrlScope([
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]);
}

export function ingestNostrEvent(event: NostrEventWithRelay): boolean {
  if (!event.id) return false;
  if (isParameterizedReplaceableKind(event.kind) && getReplaceableEventKey(event) === null) {
    return false;
  }

  const existing = eventsById.get(event.id);
  const incomingRelays = getRelayUrls(event);
  const mergedRelays = existing
    ? Array.from(new Set([...getRelayUrls(existing), ...incomingRelays])).sort()
    : incomingRelays;

  if (mergedRelays.length === 0) {
    // Reject orphan events; the converter should never emit these but a loud
    // log makes any leak visible at the ingestion boundary.
    console.warn("[nostr-events-store] dropping event without relay attribution", {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
    });
    return false;
  }

  const normalized: NostrEventWithRelay = {
    ...event,
    relayUrl: mergedRelays[0],
    relayUrls: mergedRelays,
  };

  const replaceableKey = getReplaceableEventKey(normalized);
  if (replaceableKey) {
    const replacedId = replaceableKeyToId.get(replaceableKey);
    if (replacedId && replacedId !== normalized.id) {
      eventsById.delete(replacedId);
    }
    replaceableKeyToId.set(replaceableKey, normalized.id);
  }

  eventsById.set(normalized.id, normalized);
  notifyChange();
  return true;
}

function buildFlatArray(): NostrEventWithRelay[] {
  if (cachedFlatArrayVersion === version) return cachedFlatArray;
  cachedFlatArray = Array.from(eventsById.values()).sort((a, b) => {
    if (a.created_at !== b.created_at) return b.created_at - a.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  cachedFlatArrayVersion = version;
  return cachedFlatArray;
}

export function getNostrEvents(): NostrEventWithRelay[] {
  return buildFlatArray();
}

export function getNostrEventsVersion(): number {
  return version;
}

export function subscribeToNostrEvents(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function useNostrEvents(): NostrEventWithRelay[] {
  useSyncExternalStore(subscribeToNostrEvents, getNostrEventsVersion, getNostrEventsVersion);
  return getNostrEvents();
}

export function __resetNostrEventsStoreForTests(): void {
  eventsById.clear();
  replaceableKeyToId.clear();
  cachedFlatArray = [];
  cachedFlatArrayVersion = -1;
  version = 0;
}
