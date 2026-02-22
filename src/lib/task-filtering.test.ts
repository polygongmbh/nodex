import { describe, expect, it } from "vitest";
import type { Channel, Person, Task } from "@/types";
import { filterTasks } from "./task-filtering";

const alice: Person = {
  id: "alice-id",
  name: "alice",
  displayName: "Alice",
  isOnline: true,
  isSelected: false,
};

const bob: Person = {
  id: "bob-id",
  name: "bob",
  displayName: "Bob",
  isOnline: true,
  isSelected: false,
};

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    author: alice,
    content: "hello #general",
    tags: ["general"],
    relays: ["r1"],
    taskType: "task",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    likes: 0,
    replies: 0,
    reposts: 0,
    ...overrides,
  };
}

describe("filterTasks", () => {
  it("filters by active relay ids", () => {
    const tasks = [
      buildTask({ id: "a", relays: ["r1"] }),
      buildTask({ id: "b", relays: ["r2"] }),
    ];

    const result = filterTasks({
      tasks,
      activeRelayIds: new Set(["r1"]),
      channels: [],
      people: [alice, bob],
      channelMatchMode: "and",
    });

    expect(result.map((task) => task.id)).toEqual(["a"]);
  });

  it("keeps tasks with unknown relay metadata visible under relay filters", () => {
    const tasks = [
      buildTask({ id: "known", relays: ["r2"] }),
      buildTask({ id: "nostr", relays: ["nostr"] }),
      buildTask({ id: "unknown", relays: ["unknown"] }),
    ];

    const result = filterTasks({
      tasks,
      activeRelayIds: new Set(["r1"]),
      channels: [],
      people: [alice, bob],
      channelMatchMode: "and",
    });

    expect(result.map((task) => task.id)).toEqual(["nostr", "unknown"]);
  });

  it("applies excluded and included channel filters", () => {
    const tasks = [
      buildTask({ id: "a", tags: ["general", "release"] }),
      buildTask({ id: "b", tags: ["release"] }),
      buildTask({ id: "c", tags: ["release", "blocked"] }),
    ];
    const channels: Channel[] = [
      { id: "general", name: "general", filterState: "included" },
      { id: "blocked", name: "blocked", filterState: "excluded" },
    ];

    const result = filterTasks({
      tasks,
      activeRelayIds: new Set(),
      channels,
      people: [alice, bob],
      channelMatchMode: "and",
    });

    expect(result.map((task) => task.id)).toEqual(["a"]);
  });

  it("does not drop tasks with many tags", () => {
    const heavyTagTask = buildTask({
      id: "heavy",
      tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
    });

    const result = filterTasks({
      tasks: [heavyTagTask],
      activeRelayIds: new Set(),
      channels: [],
      people: [alice, bob],
      channelMatchMode: "and",
    });
    expect(result).toHaveLength(1);
  });

  it("matches selected people by author id or mentions", () => {
    const selectedBob: Person = { ...bob, isSelected: true };
    const tasks = [
      buildTask({ id: "author", author: bob }),
      buildTask({ id: "mention", author: alice, content: "ping @bob" }),
      buildTask({ id: "other", author: alice, content: "plain text" }),
    ];

    const result = filterTasks({
      tasks,
      activeRelayIds: new Set(),
      channels: [],
      people: [alice, selectedBob],
      channelMatchMode: "and",
    });

    expect(result.map((task) => task.id)).toEqual(["author", "mention"]);
  });

  it("matches any included channel when mode is or", () => {
    const tasks = [
      buildTask({ id: "a", tags: ["general"] }),
      buildTask({ id: "b", tags: ["release"] }),
      buildTask({ id: "c", tags: ["ops"] }),
      buildTask({ id: "d", tags: ["general", "blocked"] }),
    ];
    const channels: Channel[] = [
      { id: "general", name: "general", filterState: "included" },
      { id: "release", name: "release", filterState: "included" },
      { id: "blocked", name: "blocked", filterState: "excluded" },
    ];

    const result = filterTasks({
      tasks,
      activeRelayIds: new Set(),
      channels,
      people: [alice, bob],
      channelMatchMode: "or",
    });

    expect(result.map((task) => task.id)).toEqual(["a", "b"]);
  });
});
