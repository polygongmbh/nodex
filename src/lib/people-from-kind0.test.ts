import { describe, expect, it } from "vitest";
import type { Person } from "@/types";
import { derivePeopleFromKind0Events } from "./people-from-kind0";
import { NostrEventKind } from "./nostr/types";

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
});
