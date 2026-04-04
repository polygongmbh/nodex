import { describe, expect, it } from "vitest";
import {
  deriveTreeTaskItemChildren,
  getDefaultTreeTaskFoldState,
  getNextTreeTaskFoldState,
} from "./tree-task-item-helpers";
import { makeTask } from "@/test/fixtures";

describe("deriveTreeTaskItemChildren", () => {
  it("separates task children from comment children and counts completed subtasks", () => {
    const parent = makeTask({ id: "parent" });
    const openChild = makeTask({ id: "open-child", parentId: "parent", status: "todo" });
    const doneChild = makeTask({ id: "done-child", parentId: "parent", status: "done" });
    const commentChild = makeTask({ id: "comment-child", parentId: "parent", taskType: "comment" });

    const summary = deriveTreeTaskItemChildren({
      allChildren: [openChild, doneChild, commentChild],
      matchingChildren: [openChild, doneChild, commentChild],
      hasMatchingFilters: true,
      currentTaskIsDirectMatch: false,
    });

    expect(summary.taskChildCount).toBe(2);
    expect(summary.commentChildCount).toBe(1);
    expect(summary.completedTaskChildCount).toBe(1);
    expect(summary.hasChildren).toBe(true);
  });

  it("uses non-terminal task children as the default matching set when filters are inactive", () => {
    const openChild = makeTask({ id: "open-child", parentId: "parent", status: "todo" });
    const closedChild = makeTask({ id: "closed-child", parentId: "parent", status: "closed" });
    const commentChild = makeTask({ id: "comment-child", parentId: "parent", taskType: "comment" });

    const summary = deriveTreeTaskItemChildren({
      allChildren: [openChild, closedChild, commentChild],
      matchingChildren: [],
      hasMatchingFilters: false,
      currentTaskIsDirectMatch: false,
    });

    expect(summary.defaultMatchingTaskChildren.map((child) => child.id)).toEqual(["open-child"]);
    expect(summary.defaultMatchingCommentChildren.map((child) => child.id)).toEqual(["comment-child"]);
    expect(summary.allVisibleDiffersFromMatching).toBe(true);
  });

  it("uses filtered children as the matching set when filters are active", () => {
    const visibleTask = makeTask({ id: "visible-task", parentId: "parent", status: "todo" });
    const hiddenTask = makeTask({ id: "hidden-task", parentId: "parent", status: "todo" });
    const visibleComment = makeTask({ id: "visible-comment", parentId: "parent", taskType: "comment" });

    const summary = deriveTreeTaskItemChildren({
      allChildren: [visibleTask, hiddenTask, visibleComment],
      matchingChildren: [visibleTask, visibleComment],
      hasMatchingFilters: true,
      currentTaskIsDirectMatch: false,
    });

    expect(summary.matchingTaskChildren.map((child) => child.id)).toEqual(["visible-task"]);
    expect(summary.matchingCommentChildren.map((child) => child.id)).toEqual(["visible-comment"]);
    expect(summary.allVisibleDiffersFromMatching).toBe(true);
  });

  it("falls back to open children for matching-only when tree matching filters are inactive", () => {
    const openChild = makeTask({ id: "open-child", parentId: "parent", status: "todo" });
    const doneChild = makeTask({ id: "done-child", parentId: "parent", status: "done" });

    const summary = deriveTreeTaskItemChildren({
      allChildren: [openChild, doneChild],
      matchingChildren: [openChild, doneChild],
      hasMatchingFilters: false,
      currentTaskIsDirectMatch: false,
    });

    expect(summary.matchingTaskChildren.map((child) => child.id)).toEqual(["open-child"]);
    expect(summary.allVisibleDiffersFromMatching).toBe(true);
  });

  it("keeps matching descendant branches visible when the current task directly matches the filter", () => {
    const openChild = makeTask({ id: "open-child", parentId: "parent", status: "todo" });
    const doneChild = makeTask({ id: "done-child", parentId: "parent", status: "done" });
    const matchingDoneChild = makeTask({ id: "matching-done-child", parentId: "parent", status: "done" });

    const summary = deriveTreeTaskItemChildren({
      allChildren: [openChild, doneChild, matchingDoneChild],
      matchingChildren: [matchingDoneChild],
      hasMatchingFilters: true,
      currentTaskIsDirectMatch: true,
    });

    expect(summary.matchingTaskChildren.map((child) => child.id)).toEqual([
      "open-child",
      "matching-done-child",
    ]);
    expect(summary.allVisibleDiffersFromMatching).toBe(true);
  });
});

describe("getDefaultTreeTaskFoldState", () => {
  it("keeps the root open in matching-only mode", () => {
    expect(getDefaultTreeTaskFoldState(0, false, false)).toBe("matchingOnly");
  });

  it("auto-expands nested branches when active filters have matching descendants", () => {
    expect(getDefaultTreeTaskFoldState(1, true, true)).toBe("matchingOnly");
  });

  it("keeps unrelated nested branches collapsed", () => {
    expect(getDefaultTreeTaskFoldState(1, true, false)).toBe("collapsed");
  });
});

describe("getNextTreeTaskFoldState", () => {
  it("cycles matching only to collapsed", () => {
    expect(getNextTreeTaskFoldState("matchingOnly", true)).toBe("collapsed");
  });

  it("expands from collapsed to allVisible when matching differs", () => {
    expect(getNextTreeTaskFoldState("collapsed", true)).toBe("allVisible");
  });

  it("skips allVisible when matching already equals all visible", () => {
    expect(getNextTreeTaskFoldState("collapsed", false)).toBe("matchingOnly");
  });

  it("cycles allVisible back to matchingOnly", () => {
    expect(getNextTreeTaskFoldState("allVisible", true)).toBe("matchingOnly");
  });

  it("collapses from allVisible when matching already equals all visible", () => {
    expect(getNextTreeTaskFoldState("allVisible", false)).toBe("collapsed");
  });
});
