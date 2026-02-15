import { describe, it, expect } from "vitest";
import type { Person, Task } from "@/types";
import { canUserChangeTaskStatus, extractAssignedMentionsFromContent } from "./task-permissions";

const user: Person = {
  id: "user-1",
  name: "alice",
  displayName: "Alice",
  avatar: "",
  isOnline: true,
  isSelected: false,
};

const baseTask: Task = {
  id: "t1",
  author: user,
  content: "Task",
  tags: ["x"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
};

describe("canUserChangeTaskStatus", () => {
  it("allows status changes for unassigned tasks", () => {
    expect(canUserChangeTaskStatus(baseTask, user)).toBe(true);
  });

  it("blocks status changes for assigned tasks when user is not assignee", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, mentions: ["bob"] }, user)).toBe(false);
  });

  it("allows assignee by username", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, mentions: ["alice"] }, user)).toBe(true);
  });

  it("uses content mentions when explicit mentions are not present", () => {
    expect(canUserChangeTaskStatus({ ...baseTask, content: "Sync with @bob" }, user)).toBe(
      false
    );
  });
});

describe("extractAssignedMentionsFromContent", () => {
  it("extracts normalized unique @mentions", () => {
    expect(extractAssignedMentionsFromContent("pair with @Alice and @bob and @alice")).toEqual([
      "alice",
      "bob",
    ]);
  });
});
