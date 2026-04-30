import { describe, expect, it } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import {
  applyTaskSortOverlays,
  buildPendingPublishDedupKey,
  dedupeMergedTasks,
  filterPendingLocalTasksForMerge,
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
    status: "open",
    ...overrides,
  });
}

describe("buildPendingPublishDedupKey", () => {
  it("normalizes tags and author identity for pending publish dedupe", () => {
    const first = buildTask("1", "2026-03-16T10:00:00.000Z", {
      content: " Same content ",
      tags: ["B", "a"],
      author: makePerson({ pubkey: "ABC123", name: "a", displayName: "A" }),
    });
    const second = buildTask("2", "2026-03-16T11:00:00.000Z", {
      content: "Same content",
      tags: ["a", "b"],
      author: makePerson({ pubkey: "abc123", name: "a", displayName: "A" }),
    });

    expect(buildPendingPublishDedupKey(first)).toBe(buildPendingPublishDedupKey(second));
  });
});

describe("filterPendingLocalTasksForMerge", () => {
  it("drops pending local tasks once the matching nostr task arrives", () => {
    const localPending = buildTask("local", "2026-03-16T10:00:00.000Z", {
      pendingPublishToken: "pending-1",
      content: "Hello world",
      tags: ["general"],
      author: makePerson({ pubkey: "abc123", name: "a", displayName: "A" }),
    });
    const persisted = buildTask("persisted", "2026-03-16T09:00:00.000Z");
    const incoming = buildTask("remote", "2026-03-16T10:00:00.000Z", {
      content: "Hello world",
      tags: ["general"],
      author: makePerson({ pubkey: "abc123", name: "a", displayName: "A" }),
    });

    expect(filterPendingLocalTasksForMerge([localPending, persisted], [incoming])).toEqual([persisted]);
  });
});

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
      taskType: "comment",
      feedMessageType: "offer",
      author: makePerson({ pubkey: "a".repeat(64), name: "a", displayName: "A" }),
      nip99: { identifier: "listing-1", title: "Listing 1", status: "active" },
    });
    const listingB = buildTask("listing-b", "2026-03-16T10:00:00.000Z", {
      taskType: "comment",
      feedMessageType: "offer",
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
