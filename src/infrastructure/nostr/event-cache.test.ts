import { beforeEach, describe, expect, it, vi } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  EMPTY_RELAY_SCOPE_KEY,
  NOSTR_EVENT_CACHE_MAX_EVENTS_PER_SCOPE,
  NOSTR_EVENT_CACHE_RETENTION_SECONDS,
  NOSTR_EVENT_CACHE_SCOPE_META_STORAGE_KEY,
  NOSTR_EVENT_CACHE_STORAGE_KEY,
  loadCachedNostrEvents,
  loadCachedNostrEventsForBootstrap,
  removeCachedNostrEventById,
  removeCachedNostrEventsByRelayUrl,
  removeRelayUrlFromCachedEvents,
  saveCachedNostrEvents,
  type CachedNostrEvent,
} from "./event-cache";

const nowSeconds = Math.floor(Date.now() / 1000);

const eventA: CachedNostrEvent = {
  id: "a",
  pubkey: "p1",
  created_at: nowSeconds - 60,
  kind: NostrEventKind.Task,
  tags: [["t", "go"]],
  content: "A",
  sig: "sig-a",
  relayUrl: "wss://relay.a",
};

const eventB: CachedNostrEvent = {
  id: "b",
  pubkey: "p2",
  created_at: nowSeconds - 30,
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
    saveCachedNostrEvents([eventA, { ...eventA, created_at: nowSeconds - 1 }]);
    const loaded = loadCachedNostrEvents();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].created_at).toBe(nowSeconds - 1);
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
      created_at: nowSeconds - 100,
      kind: NostrEventKind.ClassifiedListing,
      tags: [["d", "listing-1"], ["status", "active"]],
      content: "old",
    };
    const newListing: CachedNostrEvent = {
      ...oldListing,
      id: "listing-new",
      created_at: nowSeconds - 50,
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
      created_at: nowSeconds - 200,
      kind: NostrEventKind.Metadata,
      tags: [],
      content: "{\"name\":\"old\"}",
    };
    const newMetadata: CachedNostrEvent = {
      ...oldMetadata,
      id: "meta-new",
      created_at: nowSeconds - 100,
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
      created_at: nowSeconds - 55,
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

  it("bootstraps from other scopes when the selected scope cache is empty", () => {
    saveCachedNostrEvents([{ ...eventA, id: "scope-a" }], "relay-a");
    saveCachedNostrEvents([{ ...eventB, id: "scope-b" }], "relay-b");

    const bootstrapped = loadCachedNostrEventsForBootstrap("relay-a,relay-b");

    expect(bootstrapped.map((event) => event.id)).toEqual(["scope-b", "scope-a"]);
  });

  it("removes matching cached ids across scoped caches", () => {
    saveCachedNostrEvents([eventA, eventB], "relay-a");
    saveCachedNostrEvents([eventB], "relay-b");

    removeCachedNostrEventById("b");

    expect(loadCachedNostrEvents("relay-a").map((event) => event.id)).toEqual(["a"]);
    expect(loadCachedNostrEvents("relay-b")).toEqual([]);
  });

  it("drops events when their last relay is removed", () => {
    const next = removeRelayUrlFromCachedEvents([{ ...eventA, relayUrl: "wss://relay.a" }], "wss://relay.a/");
    expect(next).toEqual([]);
  });

  it("removes relay-attributed events across scoped caches", () => {
    saveCachedNostrEvents([
      { ...eventA, relayUrl: "wss://relay.a" },
      { ...eventB, relayUrl: "wss://relay.b" },
    ], "all");

    removeCachedNostrEventsByRelayUrl("wss://relay.a/");

    expect(loadCachedNostrEvents("all").map((event) => event.id)).toEqual(["b"]);
  });

  it("returns empty data for the empty relay scope", () => {
    saveCachedNostrEvents([{ ...eventA }], EMPTY_RELAY_SCOPE_KEY);
    expect(loadCachedNostrEvents(EMPTY_RELAY_SCOPE_KEY)).toEqual([]);
  });

  it("preserves distinct metadata variants for the same pubkey across relays", () => {
    const relayOneMetadata: CachedNostrEvent = {
      id: "meta-relay-1",
      pubkey: "author",
      created_at: nowSeconds - 20,
      kind: NostrEventKind.Metadata,
      tags: [],
      content: JSON.stringify({ name: "relay one" }),
      relayUrl: "wss://relay.a",
    };
    const relayTwoMetadata: CachedNostrEvent = {
      id: "meta-relay-2",
      pubkey: "author",
      created_at: nowSeconds - 10,
      kind: NostrEventKind.Metadata,
      tags: [],
      content: JSON.stringify({ name: "relay two" }),
      relayUrl: "wss://relay.b",
    };

    saveCachedNostrEvents([relayOneMetadata, relayTwoMetadata], "all");

    expect(loadCachedNostrEvents("all").map((event) => event.id)).toEqual(["meta-relay-2", "meta-relay-1"]);
  });

  it("retains only recent events within the configured window", () => {
    saveCachedNostrEvents([
      { ...eventA, id: "recent", created_at: nowSeconds - 10 },
      {
        ...eventB,
        id: "stale",
        created_at: nowSeconds - NOSTR_EVENT_CACHE_RETENTION_SECONDS - 10,
      },
    ]);

    expect(loadCachedNostrEvents().map((event) => event.id)).toEqual(["recent"]);
  });

  it("caps persisted event count per scope", () => {
    const oversized = Array.from({ length: NOSTR_EVENT_CACHE_MAX_EVENTS_PER_SCOPE + 25 }, (_, index) => ({
      ...eventA,
      id: `event-${index}`,
      created_at: nowSeconds - index,
    }));
    saveCachedNostrEvents(oversized, "relay-cap");

    expect(loadCachedNostrEvents("relay-cap")).toHaveLength(NOSTR_EVENT_CACHE_MAX_EVENTS_PER_SCOPE);
  });

  it("evicts least-recently-used scoped cache entries when quota recovery is needed", () => {
    saveCachedNostrEvents([{ ...eventA, id: "old-scope-event" }], "relay-old");
    saveCachedNostrEvents([{ ...eventA, id: "new-scope-event" }], "relay-new");

    localStorage.setItem(
      NOSTR_EVENT_CACHE_SCOPE_META_STORAGE_KEY,
      JSON.stringify({
        "relay-old": { lastUsedAt: 1 },
        "relay-new": { lastUsedAt: Date.now() },
        "relay-current": { lastUsedAt: Date.now() + 1000 },
      })
    );

    const currentScopeStorageKey = `${NOSTR_EVENT_CACHE_STORAGE_KEY}:scope:relay-current`;
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, "setItem").mockImplementation((key: string, value: string) => {
      if (key === currentScopeStorageKey && localStorage.getItem(`${NOSTR_EVENT_CACHE_STORAGE_KEY}:scope:relay-old`)) {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      originalSetItem(key, value);
    });

    expect(() =>
      saveCachedNostrEvents([{ ...eventA, id: "current-event" }], "relay-current")
    ).not.toThrow();

    expect(loadCachedNostrEvents("relay-old")).toEqual([]);
    expect(loadCachedNostrEvents("relay-current").map((event) => event.id)).toEqual(["current-event"]);
    setItemSpy.mockRestore();
  });
});
