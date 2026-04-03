import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
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

  it("passes when assignee pubkeys match selected person id", () => {
    const task: Task = { ...baseTask, assigneePubkeys: ["alice-pubkey"] };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });

  it("passes when mentions match selected person even if assignee pubkeys do not", () => {
    const task: Task = {
      ...baseTask,
      assigneePubkeys: ["charlie-pubkey"],
      mentions: ["alice-pubkey"],
    };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });

  it("passes when content mention matches selected person even if assignee pubkeys do not", () => {
    const task: Task = {
      ...baseTask,
      content: "need @alice on this",
      assigneePubkeys: ["charlie-pubkey"],
    };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });

  it("fails when neither author nor mentions match selected person", () => {
    const task: Task = { ...baseTask, content: "no mention for selected person" };
    expect(taskMatchesSelectedPeople(task, [alice])).toBe(false);
  });

  it("does not crash when author id is missing at runtime", () => {
    const task = {
      ...baseTask,
      author: { ...baseTask.author, id: undefined },
      mentions: ["alice-pubkey"],
    } as unknown as Task;

    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });

  it("does not crash when mentions contain non-string values", () => {
    const task = {
      ...baseTask,
      mentions: [null, 42, "alice-pubkey"],
    } as unknown as Task;

    expect(taskMatchesSelectedPeople(task, [alice])).toBe(true);
  });
});
