import { describe, expect, it } from "vitest";
import {
  buildTreeVisibilityState,
  createTreeSelectors,
  getAncestorChainFromSource,
  sortKanbanColumnTasks,
} from "./use-task-view-states";
import { buildTaskViewFilterIndex } from "@/domain/content/task-view-filtering";
import { buildChildrenMap } from "@/domain/content/task-sorting";
import { makeChannel, makePerson, makeTask } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";

describe("getAncestorChainFromSource", () => {
  it("returns the full ancestor chain when no active item is set", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general" });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #general" });
    const taskById = new Map([root, middle, leaf].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "leaf")).toEqual([
      { id: "root", text: "Root task general" },
      { id: "middle", text: "Middle task general" },
    ]);
  });

  it("trims ancestors above the active item and omits the active item itself", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general" });
    const branch = makeTask({ id: "branch", parentId: "middle", content: "Branch task #general" });
    const leaf = makeTask({ id: "leaf", parentId: "branch", content: "Leaf task #general" });
    const taskById = new Map([root, middle, branch, leaf].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "leaf", "middle")).toEqual([
      { id: "branch", text: "Branch task general" },
    ]);
  });

  it("returns an empty chain when the rendered item is the active item", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general" });
    const taskById = new Map([root, child].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "child", "child")).toEqual([]);
  });

  it("returns an empty chain for a direct child of the active item", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general" });
    const grandchild = makeTask({ id: "grandchild", parentId: "child", content: "Grandchild task #general" });
    const taskById = new Map([root, child, grandchild].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "grandchild", "child")).toEqual([]);
  });

  it("falls back to the full chain when the active item is not an ancestor", () => {
    const root = makeTask({ id: "root", content: "Root task #general" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general" });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #general" });
    const outsider = makeTask({ id: "outsider", content: "Outside task #general" });
    const taskById = new Map([root, middle, leaf, outsider].map((task) => [task.id, task] as const));

    expect(getAncestorChainFromSource({ taskById }, "leaf", "outsider")).toEqual([
      { id: "root", text: "Root task general" },
      { id: "middle", text: "Middle task general" },
    ]);
  });
});

describe("buildTreeVisibilityState", () => {
  it("keeps ancestor paths visible for deep matches", () => {
    const root = makeTask({ id: "root", content: "Root task" });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task" });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #beta", tags: ["beta"] });
    const tasks = [root, middle, leaf];
    const childrenMap = new Map<string | undefined, typeof tasks>([
      [undefined, [root]],
      ["root", [middle]],
      ["middle", [leaf]],
    ]);
    const visibility = buildTreeVisibilityState({
      focusedTaskId: null,
      prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
      sortContext: {
        childrenMap,
        allTasks: tasks,
        taskById: new Map(tasks.map((task) => [task.id, task] as const)),
      },
      directlyMatchingIds: new Set(["leaf"]),
    });

    expect(visibility.visibleTasks.map((task) => task.id)).toEqual(["root"]);
    expect(Array.from(visibility.matchingVisibleIds)).toEqual(["leaf", "middle", "root"]);
    expect(Array.from(visibility.directlyMatchingIds)).toEqual(["leaf"]);
  });
});

describe("createTreeSelectors", () => {
  it("treats selected people as active matching filters", () => {
    const alice = makePerson({ id: "alice", name: "alice", displayName: "Alice Doe", isSelected: true });
    const bob = makePerson({ id: "bob", name: "bob", displayName: "Bob Doe" });
    const aliceTask = makeTask({ id: "alice-task", author: alice, content: "Ship #general" });
    const bobTask = makeTask({ id: "bob-task", author: bob, content: "Review #general" });
    const tasks = [aliceTask, bobTask];
    const childrenMap = new Map<string | undefined, typeof tasks>([
      [undefined, [aliceTask, bobTask]],
    ]);
    const taskById = new Map(tasks.map((task) => [task.id, task] as const));
    const selectors = createTreeSelectors({
      allTasks: tasks,
      focusedTaskId: null,
      deferredSearchQuery: "",
      channels: [makeChannel()],
      people: [alice, bob],
      quickFilters: makeQuickFilterState(),
      channelMatchMode: "and",
      taskById,
      childrenMap,
      prefilteredTaskIds: new Set(tasks.map((task) => task.id)),
      filterIndex: buildTaskViewFilterIndex(tasks, [alice, bob]),
      sortContext: {
        childrenMap,
        allTasks: tasks,
        taskById,
      },
      scopeModel: {
        hasActiveFilters: true,
        hasSelectedScope: true,
        scopeDescription: null,
        filteredSentence: null,
        scopeFooterSentence: null,
        mobileFallbackHint: null,
        loadingSentence: null,
        errorSentence: null,
        errorSubtitle: "",
        screenState: "default",
      },
    });

    expect(selectors.hasMatchingFilters()).toBe(true);
    expect(selectors.getVisibleTasks().map((task) => task.id)).toEqual(["alice-task"]);
    expect(selectors.getDisplayedTasks({ useMobileFallback: true }).map((task) => task.id)).toEqual(["alice-task"]);
  });
});

describe("sortKanbanColumnTasks", () => {
  it("uses latest edit time for done and closed columns", () => {
    const olderDone = makeTask({
      id: "older-done",
      status: "done",
      timestamp: new Date("2026-02-17T09:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T10:00:00.000Z"),
    });
    const newerDone = makeTask({
      id: "newer-done",
      status: "done",
      timestamp: new Date("2026-02-17T08:00:00.000Z"),
      lastEditedAt: new Date("2026-02-17T11:00:00.000Z"),
    });
    const tasks = [olderDone, newerDone];
    const sortContext = {
      allTasks: tasks,
      childrenMap: buildChildrenMap(tasks),
      taskById: new Map(tasks.map((task) => [task.id, task] as const)),
    };

    expect(sortKanbanColumnTasks(tasks, "done", sortContext).map((task) => task.id)).toEqual([
      "newer-done",
      "older-done",
    ]);
    expect(sortKanbanColumnTasks(tasks, "closed", sortContext).map((task) => task.id)).toEqual([
      "newer-done",
      "older-done",
    ]);
  });
});
