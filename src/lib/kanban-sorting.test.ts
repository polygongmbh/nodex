import { describe, expect, it } from "vitest";
import type { TaskPost } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { sortByLatestModified } from "./kanban-sorting";

const makeTask = (id: string, timestamp: Date, lastEditedAt?: Date): TaskPost => ({
  id,
  kind: NostrEventKind.Task,
  pubkey: "u1",
  content: id,
  tags: ["x"],
  relays: ["demo"],

  timestamp,
  lastEditedAt,
  stateUpdates: [],
  dates: [],
  assigneePubkeys: [],
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
