import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NOSTR_EVENT_CACHE_STORAGE_KEY,
  loadCachedNostrEvents,
  removeCachedNostrEventById,
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

  it("merges relay attribution when the same event id is seen on multiple relays", () => {
    saveCachedNostrEvents([
      { ...eventA, relayUrl: "wss://relay.a/" },
      { ...eventA, relayUrl: "wss://relay.b" },
    ]);
    const loaded = loadCachedNostrEvents();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].relayUrls).toEqual(["wss://relay.a", "wss://relay.b"]);
  });

  it("normalizes legacy relayUrl values into relayUrls when loading", () => {
    saveCachedNostrEvents([{ ...eventA, relayUrl: "wss://relay.a/" }]);
    const loaded = loadCachedNostrEvents();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].relayUrls).toEqual(["wss://relay.a"]);
  });

  it("keeps only the latest revision for parameterized replaceable events", () => {
    const oldListing: CachedNostrEvent = {
      id: "listing-old",
      pubkey: "seller",
      created_at: 10,
      kind: NostrEventKind.ClassifiedListing,
      tags: [["d", "listing-1"], ["status", "active"]],
      content: "old",
    };
    const newListing: CachedNostrEvent = {
      ...oldListing,
      id: "listing-new",
      created_at: 20,
      tags: [["d", "listing-1"], ["status", "sold"]],
      content: "new",
    };

    saveCachedNostrEvents([oldListing, newListing]);
    const loaded = loadCachedNostrEvents();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("listing-new");
  });

  it("keeps only the latest revision for unparameterized replaceable events", () => {
    const oldMetadata: CachedNostrEvent = {
      id: "meta-old",
      pubkey: "author",
      created_at: 100,
      kind: NostrEventKind.Metadata,
      tags: [],
      content: "{\"name\":\"old\"}",
    };
    const newMetadata: CachedNostrEvent = {
      ...oldMetadata,
      id: "meta-new",
      created_at: 200,
      content: "{\"name\":\"new\"}",
    };

    saveCachedNostrEvents([oldMetadata, newMetadata]);
    const loaded = loadCachedNostrEvents();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("meta-new");
  });

  it("discards invalid parameterized replaceable events missing d", () => {
    const invalidListing: CachedNostrEvent = {
      id: "invalid-listing",
      pubkey: "seller",
      created_at: 55,
      kind: NostrEventKind.ClassifiedListing,
      tags: [["status", "active"]],
      content: "invalid",
    };

    saveCachedNostrEvents([invalidListing]);
    const loaded = loadCachedNostrEvents();

    expect(loaded).toEqual([]);
  });

  it("removes a cached event by id", () => {
    saveCachedNostrEvents([eventA, eventB]);
    removeCachedNostrEventById("b");
    const loaded = loadCachedNostrEvents();
    expect(loaded.map((event) => event.id)).toEqual(["a"]);
  });

  it("stores and reads cache entries per feed scope", () => {
    saveCachedNostrEvents([eventA], "relay-a");
    saveCachedNostrEvents([eventB], "relay-b");

    expect(loadCachedNostrEvents("relay-a").map((event) => event.id)).toEqual(["a"]);
    expect(loadCachedNostrEvents("relay-b").map((event) => event.id)).toEqual(["b"]);
  });

  it("removes matching cached ids across scoped caches", () => {
    saveCachedNostrEvents([eventA, eventB], "relay-a");
    saveCachedNostrEvents([eventB], "relay-b");

    removeCachedNostrEventById("b");

    expect(loadCachedNostrEvents("relay-a").map((event) => event.id)).toEqual(["a"]);
    expect(loadCachedNostrEvents("relay-b")).toEqual([]);
  });
});
