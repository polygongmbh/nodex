import { describe, it, expect } from "vitest";
import { getTaskStatusFromTask, type Task, type TaskPost, getTaskStateUpdates } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { applyTaskStateUpdate } from "./task-state";
import { makePerson } from "@/test/fixtures";

const baseTask: TaskPost = {
  id: "n1",
  kind: NostrEventKind.Task,
  author: makePerson({ pubkey: "u1", name: "me", displayName: "Me", avatar: "" }),
  content: "Task",
  tags: ["x"],
  relays: ["demo"],

  timestamp: new Date(),
  stateUpdates: [],
  dates: [],
  assigneePubkeys: [],
};

describe("applyTaskStateUpdate", () => {
  it("creates a local override for non-local tasks so status does not revert", () => {
    const localTasks: Task[] = [];
    const allTasks: Task[] = [baseTask];

    const updated = applyTaskStateUpdate(localTasks, allTasks, "n1", "done", "me");

    const task = updated.find((t) => t.id === "n1");
    expect(getTaskStatusFromTask(task)).toBe("done");
    expect(getTaskStateUpdates(task)?.[0]?.state).toEqual({ status: "done" });
  });

  it("updates lastEditedAt when status changes", () => {
    const localTasks: Task[] = [baseTask];
    const allTasks: Task[] = [baseTask];

    const before = Date.now();
    const updated = applyTaskStateUpdate(localTasks, allTasks, "n1", "active", "me");
    const editedAt = updated.find((t) => t.id === "n1")?.lastEditedAt;

    expect(editedAt).toBeDefined();
    expect(editedAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("updates done tasks to closed", () => {
    const localTasks: Task[] = [
      {
        ...baseTask,
        stateUpdates: [
          {
            id: "init-done",
            state: { status: "done" },
            timestamp: baseTask.timestamp,
            authorPubkey: baseTask.author.pubkey,
          },
        ],
      } satisfies TaskPost,
    ];
    const allTasks: Task[] = localTasks;

    const updated = applyTaskStateUpdate(localTasks, allTasks, "n1", "closed");

    expect(getTaskStatusFromTask(updated.find((t) => t.id === "n1"))).toBe("closed");
  });

  it("prepends a local optimistic update onto an existing local task's history", () => {
    const existingLocal: TaskPost = {
      ...baseTask,
      stateUpdates: [
        {
          id: "relay-state-1",
          state: { status: "open" },
          timestamp: new Date("2026-01-01T00:00:00.000Z"),
          authorPubkey: "relay-author",
        },
      ],
    };
    const localTasks: Task[] = [existingLocal];
    const allTasks: Task[] = [existingLocal];

    const updated = applyTaskStateUpdate(localTasks, allTasks, "n1", "active", "me");
    const task = updated.find((t) => t.id === "n1");

    expect(getTaskStateUpdates(task)).toHaveLength(2);
    expect(getTaskStateUpdates(task)?.[0]?.state).toEqual({ status: "active" });
    expect(getTaskStateUpdates(task)?.[1]?.id).toBe("relay-state-1");
  });
});
