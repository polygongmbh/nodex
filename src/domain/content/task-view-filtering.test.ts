import { describe, expect, it } from "vitest";
import { makePerson, makeTask } from "@/test/fixtures";
import {
  buildTaskViewFilterIndex,
  filterTasksForView,
  getDirectMatchTaskIdsForView,
  getDescendantTaskIds,
} from "./task-view-filtering";

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

  it("builds reusable search and descendant indexes", () => {
    const alice = makePerson({ id: "p1", displayName: "Alice Example", name: "alice" });
    const tasks = [
      makeTask({
        id: "root",
        parentId: undefined,
        content: "Root task #alpha",
        tags: ["alpha"],
        author: alice,
      }),
      makeTask({
        id: "child",
        parentId: "root",
        content: "Discuss launch with #beta",
        tags: ["beta"],
        author: alice,
      }),
    ];

    const index = buildTaskViewFilterIndex(tasks, [alice]);

    expect(index.descendantIdsByTaskId.get("root")).toEqual(new Set(["child"]));
    expect(index.searchableTextByTaskId.get("child")).toContain("alice example");
    expect(index.searchableTextByTaskId.get("child")).toContain("#beta");
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

    const filterIndex = buildTaskViewFilterIndex(tasks, people);
    const result = filterTasksForView({
      source: {
        allTasks: tasks,
        filterIndex,
        prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
        people,
      },
      scope: {
        focusedTaskId: "root",
      },
      criteria: {
        searchQuery: "discuss",
        channels: {
          included: ["alpha", "beta"],
          excluded: [],
          matchMode: "and",
        },
      },
    });

    expect(result.map((task) => task.id)).toEqual(["descendant-hit"]);
  });

  it("matches hashtag queries and plain tag queries through the shared search index", () => {
    const task = makeTask({
      id: "tagged-task",
      content: "Discuss launch timing",
      tags: ["beta"],
    });
    const filterIndex = buildTaskViewFilterIndex([task]);
    const baseParams = {
      source: {
        allTasks: [task],
        filterIndex,
        prefilteredTaskIds: new Set([task.id]),
        people: [],
      },
      criteria: {
        channels: {
          included: [],
          excluded: [],
          matchMode: "and" as const,
        },
      },
    };

    expect(
      getDirectMatchTaskIdsForView({
        ...baseParams,
        criteria: {
          ...baseParams.criteria,
          searchQuery: "#beta",
        },
      })
    ).toEqual(new Set(["tagged-task"]));

    expect(
      getDirectMatchTaskIdsForView({
        ...baseParams,
        criteria: {
          ...baseParams.criteria,
          searchQuery: "beta",
        },
      })
    ).toEqual(new Set(["tagged-task"]));
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

    const filterIndex = buildTaskViewFilterIndex(tasks);
    const result = filterTasksForView({
      source: {
        allTasks: tasks,
        filterIndex,
        prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
        people: [],
      },
      scope: {
        focusedTaskId: "root",
        includeFocusedTask: true,
      },
      criteria: {
        searchQuery: "",
        channels: {
          included: ["alpha", "beta"],
          excluded: ["blocked"],
          matchMode: "or",
        },
      },
    });

    expect(result.map((task) => task.id)).toEqual(["root", "descendant-1"]);
  });

  it("can hide closed tasks without hiding done tasks", () => {
    const tasks = [
      makeTask({
        id: "todo-task",
        content: "Todo task #alpha",
        tags: ["alpha"],
        status: "open",
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

    const filterIndex = buildTaskViewFilterIndex(tasks);
    const result = filterTasksForView({
      source: {
        allTasks: tasks,
        filterIndex,
        prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
        people: [],
      },
      scope: {
        focusedTaskId: null,
        hideClosedTasks: true,
      },
      criteria: {
        searchQuery: "",
        channels: {
          included: [],
          excluded: [],
          matchMode: "and",
        },
      },
    });

    expect(result.map((task) => task.id)).toEqual(["todo-task", "done-task"]);
  });

  it("keeps an explicitly focused closed task visible when includeFocusedTask is enabled", () => {
    const tasks = [
      makeTask({
        id: "closed-root",
        content: "Closed root #alpha",
        tags: ["alpha"],
        status: "closed",
      }),
      makeTask({
        id: "open-child",
        parentId: "closed-root",
        content: "Open child #alpha",
        tags: ["alpha"],
        status: "open",
      }),
      makeTask({
        id: "closed-descendant",
        parentId: "closed-root",
        content: "Closed descendant #alpha",
        tags: ["alpha"],
        status: "closed",
      }),
    ];

    const filterIndex = buildTaskViewFilterIndex(tasks);
    const result = filterTasksForView({
      source: {
        allTasks: tasks,
        filterIndex,
        prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
        people: [],
      },
      scope: {
        focusedTaskId: "closed-root",
        includeFocusedTask: true,
        hideClosedTasks: true,
      },
      criteria: {
        searchQuery: "",
        channels: {
          included: [],
          excluded: [],
          matchMode: "and",
        },
      },
    });

    expect(result.map((task) => task.id)).toEqual(["closed-root", "open-child"]);
  });
});
