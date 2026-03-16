import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { applyTaskSortOverlays } from "./use-index-derived-data";

const baseAuthor = {
  id: "user-1",
  name: "me",
  displayName: "Me",
  avatar: "",
  isOnline: false,
  isSelected: false,
};

function buildTask(id: string, timestampIso: string): Task {
  return {
    id,
    author: baseAuthor,
    content: `Task ${id}`,
    tags: ["test"],
    relays: ["demo"],
    taskType: "task",
    timestamp: new Date(timestampIso),
    likes: 0,
    replies: 0,
    reposts: 0,
    status: "todo",
  };
}

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
      { older: "in-progress" },
      { older: "2026-03-16T13:00:00.000Z" }
    );

    expect(updated.map((task) => task.id)).toEqual(["newer", "older"]);
  });
});
