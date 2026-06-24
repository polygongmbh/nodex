import { beforeEach, describe, expect, it } from "vitest";
import {
  Kind0Cache,
  derivePeopleFromKind0Events,
  mergeKind0EventsWithCache,
} from "./people-from-kind0";
import { NostrEventKind } from "@/lib/nostr/types";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

function metadataEvent(pubkey: string, content: object, created_at = 1) {
  return {
    id: `kind0-${pubkey.slice(0, 8)}-${created_at}`,
    kind: NostrEventKind.Metadata,
    pubkey,
    created_at,
    tags: [] as string[][],
    sig: "",
    content: JSON.stringify(content),
  };
}

describe("derivePeopleFromKind0Events", () => {
  it("uses selected relay metadata first", () => {
    const people = derivePeopleFromKind0Events(
      [ALICE],
      [metadataEvent(ALICE, { name: "alice", displayName: "Alice Selected" }, 2)],
      [metadataEvent(ALICE, { name: "fallback", displayName: "Fallback Name" }, 3)],
    );
    expect(people).toHaveLength(1);
    expect(people[0].displayName).toBe("Alice Selected");
  });

  it("falls back to cached metadata from another relay when the selected relay has no profile", () => {
    const people = derivePeopleFromKind0Events(
      [BOB],
      [],
      [metadataEvent(BOB, { name: "bob", displayName: "Bob Fallback" })],
    );
    expect(people[0].displayName).toBe("Bob Fallback");
  });

  it("falls back to a pubkey placeholder when no metadata exists", () => {
    const people = derivePeopleFromKind0Events([ALICE], [], []);
    expect(people[0].name.startsWith("npub1")).toBe(true);
  });
});

describe("mergeKind0EventsWithCache", () => {
  it("keeps the newest event per pubkey", () => {
    const merged = mergeKind0EventsWithCache(
      [metadataEvent(ALICE, { name: "new" }, 10)],
      [metadataEvent(ALICE, { name: "old" }, 5)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].created_at).toBe(10);
  });
});

describe("Kind0Cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("ingests events per relay and reads them back, latest per pubkey wins", () => {
    const cache = new Kind0Cache();
    cache.ingest({ ...metadataEvent(ALICE, { name: "v1" }, 1), relayUrls: ["wss://relay.one"] });
    cache.ingest({ ...metadataEvent(ALICE, { name: "v2" }, 2), relayUrls: ["wss://relay.one"] });

    const events = cache.loadForRelay("wss://relay.one");
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].content).name).toBe("v2");
  });

  it("keeps per-relay variants separate for the same pubkey", () => {
    const cache = new Kind0Cache();
    cache.ingest({ ...metadataEvent(ALICE, { name: "one" }, 1), relayUrls: ["wss://relay.one"] });
    cache.ingest({ ...metadataEvent(ALICE, { name: "two" }, 1), relayUrls: ["wss://relay.two"] });

    expect(cache.loadForRelay("wss://relay.one")[0].content).toContain("one");
    expect(cache.loadForRelay("wss://relay.two")[0].content).toContain("two");
  });

  it("drops a relay's cache when removeRelay is called", () => {
    const cache = new Kind0Cache();
    cache.ingest({ ...metadataEvent(ALICE, { name: "alice" }, 1), relayUrls: ["wss://relay.one"] });
    cache.removeRelay("wss://relay.one/");
    expect(cache.loadForRelay("wss://relay.one")).toEqual([]);
  });

  it("hydrates a fresh instance from localStorage", () => {
    const first = new Kind0Cache();
    first.save([metadataEvent(ALICE, { name: "alice" }, 42)], "wss://relay.one/");
    first.flushDirtyToStorage();

    const second = new Kind0Cache();
    const loaded = second.loadForRelay("wss://relay.one");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].created_at).toBe(42);
  });

  it("ignores legacy storage keys outside its prefix", () => {
    window.localStorage.setItem(
      "nodex.kind0.cache.v1",
      JSON.stringify([metadataEvent(ALICE, { name: "alice" }, 42)]),
    );
    const cache = new Kind0Cache();
    expect(cache.loadAll()).toEqual([]);
  });
});

