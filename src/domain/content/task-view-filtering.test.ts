import { describe, expect, it } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import { filterTasksForView, getDescendantTaskIds } from "./task-view-filtering";

describe("task view filtering", () => {
  it("collects all descendants for focused filtering", () => {
    const tasks = [
      makeTask({ id: "root", parentId: undefined }),
      makeTask({ id: "child-a", parentId: "root" }),
      makeTask({ id: "child-b", parentId: "root" }),
      makeTask({ id: "grandchild", parentId: "child-a" }),
    ];

    expect(getDescendantTaskIds(tasks, "root")).toEqual(
      new Set(["child-a", "child-b", "grandchild"])
    );
  });

  it("filters by prefiltered ids, focus descendants, search, and channel match mode", () => {
    const people = [makePerson({ id: "p1", displayName: "Alice" })];
    const tasks = [
      makeTask({
        id: "root",
        parentId: undefined,
        content: "Root task #alpha",
        tags: ["alpha"],
      }),
      makeTask({
        id: "descendant-hit",
        parentId: "root",
        content: "Discuss alpha topic",
        tags: ["alpha", "beta"],
      }),
      makeTask({
        id: "descendant-miss-search",
        parentId: "root",
        content: "Unrelated",
        tags: ["alpha", "beta"],
      }),
      makeTask({
        id: "outside-focus",
        parentId: undefined,
        content: "Discuss alpha topic",
        tags: ["alpha", "beta"],
      }),
    ];

    const result = filterTasksForView({
      allTasks: tasks,
      prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
      focusedTaskId: "root",
      searchQuery: "discuss",
      people,
      includedChannels: ["alpha", "beta"],
      excludedChannels: [],
      channelMatchMode: "and",
    });

    expect(result.map((task) => task.id)).toEqual(["descendant-hit"]);
  });

  it("supports include focused task and OR channel mode while honoring excludes", () => {
    const tasks = [
      makeTask({
        id: "root",
        parentId: undefined,
        content: "Root task #alpha",
        tags: ["alpha"],
      }),
      makeTask({
        id: "descendant-1",
        parentId: "root",
        content: "Beta task",
        tags: ["beta"],
      }),
      makeTask({
        id: "descendant-excluded",
        parentId: "root",
        content: "Gamma task",
        tags: ["gamma", "blocked"],
      }),
    ];

    const result = filterTasksForView({
      allTasks: tasks,
      prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
      focusedTaskId: "root",
      includeFocusedTask: true,
      searchQuery: "",
      people: [],
      includedChannels: ["alpha", "beta"],
      excludedChannels: ["blocked"],
      channelMatchMode: "or",
    });

    expect(result.map((task) => task.id)).toEqual(["root", "descendant-1"]);
  });

  it("can hide closed tasks without hiding done tasks", () => {
    const tasks = [
      makeTask({
        id: "todo-task",
        content: "Todo task #alpha",
        tags: ["alpha"],
        status: "todo",
      }),
      makeTask({
        id: "done-task",
        content: "Done task #alpha",
        tags: ["alpha"],
        status: "done",
      }),
      makeTask({
        id: "closed-task",
        content: "Closed task #alpha",
        tags: ["alpha"],
        status: "closed",
      }),
    ];

    const result = filterTasksForView({
      allTasks: tasks,
      prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
      searchQuery: "",
      people: [],
      includedChannels: [],
      excludedChannels: [],
      channelMatchMode: "and",
      hideClosedTasks: true,
    });

    expect(result.map((task) => task.id)).toEqual(["todo-task", "done-task"]);
  });
});
