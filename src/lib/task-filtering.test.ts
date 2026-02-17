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
    });

    expect(result.map((task) => task.id)).toEqual(["a"]);
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
    });

    expect(result.map((task) => task.id)).toEqual(["a"]);
  });

  it("keeps large-tag tasks only when channel filters are active", () => {
    const heavyTagTask = buildTask({
      id: "heavy",
      tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
    });

    const withoutChannelFilters = filterTasks({
      tasks: [heavyTagTask],
      activeRelayIds: new Set(),
      channels: [],
      people: [alice, bob],
    });
    expect(withoutChannelFilters).toHaveLength(0);

    const withChannelFilters = filterTasks({
      tasks: [heavyTagTask],
      activeRelayIds: new Set(),
      channels: [{ id: "tag-1", name: "tag-1", filterState: "included" }],
      people: [alice, bob],
    });
    expect(withChannelFilters).toHaveLength(1);
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
    });

    expect(result.map((task) => task.id)).toEqual(["author", "mention"]);
  });
});
