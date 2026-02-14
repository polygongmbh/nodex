import { describe, it, expect } from "vitest";
import type { Task } from "@/types";
import { applyTaskStatusUpdate } from "./task-status";

const baseTask: Task = {
  id: "n1",
  author: {
    id: "u1",
    name: "me",
    displayName: "Me",
    avatar: "",
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
  it("creates a local override for non-local tasks so status does not revert", () => {
    const localTasks: Task[] = [];
    const allTasks: Task[] = [baseTask];

    const updated = applyTaskStatusUpdate(localTasks, allTasks, "n1", "done", "me");

    expect(updated.find((t) => t.id === "n1")?.status).toBe("done");
  });
});
