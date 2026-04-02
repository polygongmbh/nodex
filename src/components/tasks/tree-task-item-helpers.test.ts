import { describe, expect, it } from "vitest";
import {
  deriveTreeTaskItemChildren,
  getNextTreeTaskFoldState,
} from "./tree-task-item-helpers";
import { makeTask } from "@/test/fixtures";
import { buildChildrenMap } from "@/domain/content/task-sorting";

describe("deriveTreeTaskItemChildren", () => {
  it("separates task children from comment children and counts completed subtasks", () => {
    const parent = makeTask({ id: "parent" });
    const openChild = makeTask({ id: "open-child", parentId: "parent", status: "todo" });
    const doneChild = makeTask({ id: "done-child", parentId: "parent", status: "done" });
    const commentChild = makeTask({ id: "comment-child", parentId: "parent", taskType: "comment" });

    const summary = deriveTreeTaskItemChildren({
      allChildren: buildChildrenMap([parent, openChild, doneChild, commentChild]).get("parent") || [],
      filteredChildren: [openChild, doneChild, commentChild],
      hasActiveFilters: true,
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
      filteredChildren: [],
      hasActiveFilters: false,
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
      filteredChildren: [visibleTask, visibleComment],
      hasActiveFilters: true,
    });

    expect(summary.filteredTaskChildren.map((child) => child.id)).toEqual(["visible-task"]);
    expect(summary.filteredCommentChildren.map((child) => child.id)).toEqual(["visible-comment"]);
    expect(summary.allVisibleDiffersFromMatching).toBe(true);
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
});
