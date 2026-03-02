import { beforeEach, describe, expect, it } from "vitest";
import type { Person } from "@/types";
import {
  derivePeopleFromKind0Events,
  loadCachedKind0Events,
  loadLoggedInIdentityPriority,
  mergeKind0EventsWithCache,
  rememberCachedKind0Profile,
  rememberLoggedInIdentity,
  saveCachedKind0Events,
} from "./people-from-kind0";
import { NostrEventKind } from "./types";

const prevPeople: Person[] = [
  {
    id: "a".repeat(64),
    name: "alice",
    displayName: "Alice",
    avatar: "",
    isOnline: true,
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

  it("uses latest kind:0 event per pubkey and preserves selection", () => {
    const pubkey = "a".repeat(64);
    const people = derivePeopleFromKind0Events(
      [
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 1,
          content: JSON.stringify({ name: "old", displayName: "Old Name" }),
        },
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 2,
          content: JSON.stringify({ name: "alice", displayName: "Alice New" }),
        },
      ],
      prevPeople
    );

    expect(people).toHaveLength(1);
    expect(people[0].displayName).toBe("Alice New");
    expect(people[0].isSelected).toBe(true);
  });

  it("ignores non-metadata events", () => {
    const people = derivePeopleFromKind0Events(
      [
        { kind: NostrEventKind.TextNote, pubkey: "b".repeat(64), created_at: 1, content: "hello" },
      ],
      []
    );

    expect(people).toEqual([]);
  });

  it("prioritizes locally remembered identities before alphabetical order", () => {
    const aPubkey = "a".repeat(64);
    const bPubkey = "b".repeat(64);
    const people = derivePeopleFromKind0Events(
      [
        { kind: NostrEventKind.Metadata, pubkey: aPubkey, created_at: 1, content: JSON.stringify({ name: "alice" }) },
        { kind: NostrEventKind.Metadata, pubkey: bPubkey, created_at: 1, content: JSON.stringify({ name: "bob" }) },
      ],
      [],
      { prioritizedPubkeys: [bPubkey] }
    );

    expect(people[0].id).toBe(bPubkey);
    expect(people[1].id).toBe(aPubkey);
  });

  it("stores and loads cached kind:0 events from local storage", () => {
    const pubkey = "a".repeat(64);
    const metadata = [{ kind: NostrEventKind.Metadata, pubkey, created_at: 42, content: JSON.stringify({ name: "alice" }) }];
    saveCachedKind0Events(metadata);

    const loaded = loadCachedKind0Events();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].pubkey).toBe(pubkey);
    expect(loaded[0].created_at).toBe(42);
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
