import { describe, it, expect } from "vitest";
import type { Task } from "@/types";
import { applyTaskStatusUpdate, cycleTaskStatus } from "./task-status";

const baseTask: Task = {
  id: "n1",
  author: {
    id: "u1",
    name: "me",
    displayName: "Me",
    avatar: "",
    isOnline: false,
    isSelected: false,
  },
  content: "Task",
  tags: ["x"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
  status: "todo",
};

describe("applyTaskStatusUpdate", () => {
  it("keeps the click cycle three-state even when closed exists", () => {
    expect(cycleTaskStatus("todo")).toBe("in-progress");
    expect(cycleTaskStatus("in-progress")).toBe("done");
    expect(cycleTaskStatus("done")).toBe("todo");
    expect(cycleTaskStatus("closed")).toBe("todo");
  });

  it("creates a local override for non-local tasks so status does not revert", () => {
    const localTasks: Task[] = [];
    const allTasks: Task[] = [baseTask];

    const updated = applyTaskStatusUpdate(localTasks, allTasks, "n1", "done", "me");

    expect(updated.find((t) => t.id === "n1")?.status).toBe("done");
  });

  it("updates lastEditedAt when status changes", () => {
    const localTasks: Task[] = [baseTask];
    const allTasks: Task[] = [baseTask];

    const before = Date.now();
    const updated = applyTaskStatusUpdate(localTasks, allTasks, "n1", "in-progress", "me");
    const editedAt = updated.find((t) => t.id === "n1")?.lastEditedAt;

    expect(editedAt).toBeDefined();
    expect(editedAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("clears completedBy when moved to closed", () => {
    const localTasks: Task[] = [{ ...baseTask, status: "done", completedBy: "me" }];
    const allTasks: Task[] = localTasks;

    const updated = applyTaskStatusUpdate(localTasks, allTasks, "n1", "closed", "me");

    expect(updated.find((t) => t.id === "n1")?.status).toBe("closed");
    expect(updated.find((t) => t.id === "n1")?.completedBy).toBeUndefined();
  });
});
