import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { sortByLatestModified } from "./kanban-sorting";
import { makePerson } from "@/test/fixtures";

const makeTask = (id: string, timestamp: Date, lastEditedAt?: Date): Task => ({
  id,
  kind: NostrEventKind.Task,
  author: makePerson({ pubkey: "u1", name: "me", displayName: "Me", avatar: "" }),
  content: id,
  tags: ["x"],
  relays: ["demo"],

  timestamp,
  lastEditedAt,
  stateUpdates: [],
});

describe("sortByLatestModified", () => {
  it("sorts by lastEditedAt descending when present", () => {
    const old = makeTask("old", new Date("2024-01-01T00:00:00.000Z"), new Date("2024-01-02T00:00:00.000Z"));
    const newer = makeTask("newer", new Date("2024-01-01T00:00:00.000Z"), new Date("2024-01-03T00:00:00.000Z"));

    const sorted = sortByLatestModified([old, newer]);
    expect(sorted.map((task) => task.id)).toEqual(["newer", "old"]);
  });

  it("sorts by lastEditedAt descending when it equals timestamp", () => {
    const older = makeTask("older", new Date("2024-01-01T00:00:00.000Z"));
    const newer = makeTask("newer", new Date("2024-01-02T00:00:00.000Z"));

    const sorted = sortByLatestModified([older, newer]);
    expect(sorted.map((task) => task.id)).toEqual(["newer", "older"]);
  });
});
