import { describe, expect, it } from "vitest";
import type { Person, Task } from "@/types";
import { taskMatchesSelectedPeople } from "./person-filter";

const alice: Person = {
  id: "alice-pubkey",
  name: "alice",
  displayName: "Alice",
  avatar: "",
  isOnline: true,
  isSelected: true,
};

const bob: Person = {
  id: "bob-pubkey",
  name: "bob",
  displayName: "Bob",
  avatar: "",
  isOnline: true,
  isSelected: false,
};

const baseTask: Task = {
  id: "task-1",
  author: bob,
  content: "hello",
  tags: ["general"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
};

describe("taskMatchesSelectedPeople", () => {
  it("passes when no people are selected", () => {
    expect(taskMatchesSelectedPeople(baseTask, [])).toBe(true);
  });

  it("passes when task author is selected", () => {
    expect(taskMatchesSelectedPeople(baseTask, [bob])).toBe(true);
  });

  it("passes when task mentions selected person", () => {
    const task: Task = { ...baseTask, content: "please review @alice" };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });

  it("passes when explicit mention id matches selected person id", () => {
    const task: Task = { ...baseTask, mentions: ["alice-pubkey"] };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });

  it("fails when neither author nor mentions match selected person", () => {
    const task: Task = { ...baseTask, content: "no mention for selected person" };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(false);
  });
});

