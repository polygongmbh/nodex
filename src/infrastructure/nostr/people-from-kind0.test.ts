import { beforeEach, describe, expect, it } from "vitest";
import type { Person } from "@/types/person";
import {
  derivePeopleFromKind0Events,
  loadCachedKind0Events,
  loadCachedKind0EventsForRelayUrls,
  loadLoggedInIdentityPriority,
  mergeKind0EventsWithCache,
  rememberCachedKind0Profile,
  rememberLoggedInIdentity,
  removeCachedKind0EventsByRelayUrl,
  saveCachedKind0Events,
} from "./people-from-kind0";
import { NostrEventKind } from "@/lib/nostr/types";

const prevPeople: Person[] = [
  {
    pubkey: "a".repeat(64),
    name: "alice",
    displayName: "Alice",
    avatar: "",
    isSelected: true,
  },
];

describe("derivePeopleFromKind0Events", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("merges live and cached metadata by newest event per pubkey", () => {
    const pubkey = "a".repeat(64);
    const merged = mergeKind0EventsWithCache(
      [{ kind: NostrEventKind.Metadata, pubkey, created_at: 10, content: JSON.stringify({ name: "new" }) }],
      [{ kind: NostrEventKind.Metadata, pubkey, created_at: 5, content: JSON.stringify({ name: "old" }) }]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].created_at).toBe(10);
  });

  it("uses selected relay metadata first and preserves selection", () => {
    const pubkey = "a".repeat(64);
    const people = derivePeopleFromKind0Events(
      [pubkey],
      [
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 2,
          content: JSON.stringify({ name: "alice", displayName: "Alice Selected" }),
        },
      ],
      [
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 3,
          content: JSON.stringify({ name: "fallback", displayName: "Fallback Name" }),
        },
      ],
      prevPeople
    );

    expect(people).toHaveLength(1);
    expect(people[0].displayName).toBe("Alice Selected");
    expect(people[0].isSelected).toBe(true);
  });

  it("falls back to cached metadata from another relay when the selected relay has no profile", () => {
    const pubkey = "b".repeat(64);
    const people = derivePeopleFromKind0Events(
      [pubkey],
      [],
      [
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 1,
          content: JSON.stringify({ name: "bob", displayName: "Bob Fallback" }),
        },
      ],
      []
    );

    expect(people).toHaveLength(1);
    expect(people[0].displayName).toBe("Bob Fallback");
  });

  it("falls back to a pubkey placeholder when no metadata exists", () => {
    const pubkey = "c".repeat(64);
    const people = derivePeopleFromKind0Events([pubkey], [], [], []);
    expect(people[0].name.startsWith("npub1")).toBe(true);
  });

  it("prioritizes locally remembered identities before alphabetical order", () => {
    const aPubkey = "a".repeat(64);
    const bPubkey = "b".repeat(64);
    const people = derivePeopleFromKind0Events(
      [aPubkey, bPubkey],
      [
        { kind: NostrEventKind.Metadata, pubkey: aPubkey, created_at: 1, content: JSON.stringify({ name: "alice" }) },
        { kind: NostrEventKind.Metadata, pubkey: bPubkey, created_at: 1, content: JSON.stringify({ name: "bob" }) },
      ],
      [],
      [],
      { prioritizedPubkeys: [bPubkey] }
    );

    expect(people[0].pubkey).toBe(bPubkey);
    expect(people[1].pubkey).toBe(aPubkey);
  });

  it("stores and loads cached kind:0 events per relay", () => {
    const pubkey = "a".repeat(64);
    const metadata = [{ kind: NostrEventKind.Metadata, pubkey, created_at: 42, content: JSON.stringify({ name: "alice" }) }];
    saveCachedKind0Events(metadata, "wss://relay.one/");

    const loaded = loadCachedKind0Events("wss://relay.one");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].pubkey).toBe(pubkey);
    expect(loaded[0].created_at).toBe(42);
  });

  it("drops unreadable legacy kind:0 cache keys instead of migrating them", () => {
    const pubkey = "a".repeat(64);
    localStorage.setItem(
      "nodex.kind0.cache.v1",
      JSON.stringify([
        { kind: NostrEventKind.Metadata, pubkey, created_at: 42, content: JSON.stringify({ name: "alice" }) },
      ])
    );

    expect(loadCachedKind0Events()).toEqual([]);
  });

  it("keeps per-relay profile variants for the same pubkey", () => {
    const pubkey = "a".repeat(64);
    saveCachedKind0Events(
      [{ kind: NostrEventKind.Metadata, pubkey, created_at: 1, content: JSON.stringify({ displayName: "Relay One" }) }],
      "wss://relay.one"
    );
    saveCachedKind0Events(
      [{ kind: NostrEventKind.Metadata, pubkey, created_at: 1, content: JSON.stringify({ displayName: "Relay Two" }) }],
      "wss://relay.two"
    );

    expect(loadCachedKind0Events("wss://relay.one")[0].content).toContain("Relay One");
    expect(loadCachedKind0Events("wss://relay.two")[0].content).toContain("Relay Two");
    expect(loadCachedKind0EventsForRelayUrls(["wss://relay.one"]).map((event) => event.content)).toContain(
      JSON.stringify({ displayName: "Relay One" })
    );
  });

  it("removes cached profiles for a removed relay", () => {
    const pubkey = "a".repeat(64);
    saveCachedKind0Events(
      [{ kind: NostrEventKind.Metadata, pubkey, created_at: 1, content: JSON.stringify({ displayName: "Relay One" }) }],
      "wss://relay.one"
    );

    removeCachedKind0EventsByRelayUrl("wss://relay.one/");

    expect(loadCachedKind0Events("wss://relay.one")).toEqual([]);
  });

  it("caches signed-in profile snapshots for local reuse", () => {
    const pubkey = "c".repeat(64);
    const next = rememberCachedKind0Profile(pubkey, {
      name: "carol",
      displayName: "Carol",
      picture: "https://example.com/carol.png",
      nip05: "carol@example.com",
    });

    expect(next.some((event) => event.pubkey === pubkey)).toBe(true);
    const loaded = loadCachedKind0Events();
    const cached = loaded.find((event) => event.pubkey === pubkey);
    expect(cached).toBeDefined();
    expect(cached?.content).toContain("carol");
  });

  it("tracks remembered login identities in recency order", () => {
    const aPubkey = "a".repeat(64);
    const bPubkey = "b".repeat(64);

    const first = rememberLoggedInIdentity(aPubkey);
    expect(first[0]).toBe(aPubkey);

    const second = rememberLoggedInIdentity(bPubkey);
    expect(second[0]).toBe(bPubkey);
    expect(second[1]).toBe(aPubkey);

    const loaded = loadLoggedInIdentityPriority();
    expect(loaded.slice(0, 2)).toEqual([bPubkey, aPubkey]);
  });
});
