import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NOSTR_EVENT_CACHE_STORAGE_KEY,
  loadCachedNostrEvents,
  saveCachedNostrEvents,
  type CachedNostrEvent,
} from "./event-cache";

const eventA: CachedNostrEvent = {
  id: "a",
  pubkey: "p1",
  created_at: 20,
  kind: NostrEventKind.Task,
  tags: [["t", "go"]],
  content: "A",
  sig: "sig-a",
  relayUrl: "wss://relay.a",
};

const eventB: CachedNostrEvent = {
  id: "b",
  pubkey: "p2",
  created_at: 40,
  kind: NostrEventKind.TextNote,
  tags: [["t", "alpha"]],
  content: "B",
  sig: "sig-b",
  relayUrl: "wss://relay.b",
};

describe("nostr event cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty list for missing or invalid cache payloads", () => {
    expect(loadCachedNostrEvents()).toEqual([]);
    localStorage.setItem(NOSTR_EVENT_CACHE_STORAGE_KEY, JSON.stringify({ bad: true }));
    expect(loadCachedNostrEvents()).toEqual([]);
  });

  it("persists and loads events in created_at-descending order", () => {
    saveCachedNostrEvents([eventA, eventB]);
    const loaded = loadCachedNostrEvents();
    expect(loaded.map((event) => event.id)).toEqual(["b", "a"]);
  });

  it("deduplicates events by id while saving", () => {
    saveCachedNostrEvents([eventA, { ...eventA, created_at: 999 }]);
    const loaded = loadCachedNostrEvents();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].created_at).toBe(999);
  });
});
