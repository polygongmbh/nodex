import { describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import { makePerson, makeTask } from "@/test/fixtures";
import {
  applyTaskSortOverlays,
  dedupeMergedTasks,
} from "./task-collections";
import type { Task } from "@/types";

const baseAuthor = makePerson({ pubkey: "user-1", name: "me", displayName: "Me" });

function buildTask(id: string, timestampIso: string, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id,
    author: baseAuthor,
    content: `Task ${id}`,
    tags: ["test"],
    relays: ["demo"],
    taskType: "task",
    timestamp: new Date(timestampIso),
    state: {
      status: "open"
    },
    ...overrides,
  });
}

describe("dedupeMergedTasks", () => {
  it("keeps one task per id while merging relay ids", () => {
    const older = buildTask("same-id", "2026-03-16T09:00:00.000Z", { relays: ["relay-a"] });
    const newer = buildTask("same-id", "2026-03-16T10:00:00.000Z", { relays: ["relay-b"] });

    const deduped = dedupeMergedTasks([older, newer]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.relays).toEqual(["relay-a", "relay-b"]);
    expect(deduped[0]?.timestamp.toISOString()).toBe("2026-03-16T10:00:00.000Z");
  });

  it("keeps the latest version of a replaceable listing", () => {
    const listingA = buildTask("listing-a", "2026-03-16T09:00:00.000Z", {
      kind: NostrEventKind.ClassifiedListing,
      taskType: "comment",
      author: makePerson({ pubkey: "a".repeat(64), name: "a", displayName: "A" }),
      nip99: { identifier: "listing-1", title: "Listing 1", status: "active" },
    });
    const listingB = buildTask("listing-b", "2026-03-16T10:00:00.000Z", {
      kind: NostrEventKind.ClassifiedListing,
      taskType: "comment",
      author: makePerson({ pubkey: "a".repeat(64), name: "a", displayName: "A" }),
      nip99: { identifier: "listing-1", title: "Listing 1", status: "sold" },
    });

    const deduped = dedupeMergedTasks([listingA, listingB]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("listing-b");
    expect(deduped[0]?.nip99?.status).toBe("sold");
  });
});

describe("applyTaskSortOverlays", () => {
  it("adds optimistic sort fields without mutating untouched tasks", () => {
    const untouched = buildTask("untouched", "2026-03-16T09:00:00.000Z");
    const updated = applyTaskSortOverlays(
      [buildTask("task-1", "2026-03-16T10:00:00.000Z"), untouched],
      { "task-1": "done" },
      { "task-1": "2026-03-16T11:00:00.000Z" }
    );
    const overlaidTask = updated[0] as Task & { sortStatus?: string; sortLastEditedAt?: Date };

    expect(overlaidTask).toMatchObject({
      id: "task-1",
      sortStatus: "done",
    });
    expect(overlaidTask.sortLastEditedAt?.toISOString()).toBe("2026-03-16T11:00:00.000Z");
    expect(updated[1]).toBe(untouched);
  });

  it("keeps task ordering by timestamp after applying overlays", () => {
    const older = buildTask("older", "2026-03-16T08:00:00.000Z");
    const newer = buildTask("newer", "2026-03-16T12:00:00.000Z");

    const updated = applyTaskSortOverlays(
      [older, newer],
      { older: "active" },
      { older: "2026-03-16T13:00:00.000Z" }
    );

    expect(updated.map((task) => task.id)).toEqual(["newer", "older"]);
  });
});
