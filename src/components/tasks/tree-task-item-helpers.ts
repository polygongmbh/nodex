import type { Task } from "@/types";
import { isTaskCompletedStatus, isTaskTerminalStatus } from "@/domain/content/task-status";

export type TreeTaskFoldState = "collapsed" | "matchingOnly" | "allVisible";

interface DeriveTreeTaskItemChildrenParams {
  allChildren: Task[];
  matchingChildren: Task[];
  hasMatchingFilters: boolean;
  currentTaskIsDirectMatch: boolean;
  parentIsTerminal?: boolean;
}

export interface TreeTaskItemChildrenState {
  allChildren: Task[];
  allTaskChildren: Task[];
  allCommentChildren: Task[];
  matchingTaskChildren: Task[];
  matchingCommentChildren: Task[];
  defaultMatchingTaskChildren: Task[];
  defaultMatchingCommentChildren: Task[];
  taskChildCount: number;
  commentChildCount: number;
  completedTaskChildCount: number;
  hasChildren: boolean;
  allVisibleDiffersFromMatching: boolean;
}

function mergeChildrenPreservingOrder(allChildren: Task[], primaryChildren: Task[], extraChildren: Task[]): Task[] {
  const includedIds = new Set<string>([
    ...primaryChildren.map((child) => child.id),
    ...extraChildren.map((child) => child.id),
  ]);

  return allChildren.filter((child) => includedIds.has(child.id));
}

export function deriveTreeTaskItemChildren({
  allChildren,
  matchingChildren,
  hasMatchingFilters,
  currentTaskIsDirectMatch,
  parentIsTerminal = false,
}: DeriveTreeTaskItemChildrenParams): TreeTaskItemChildrenState {
  const allTaskChildren = allChildren.filter((child) => child.taskType === "task");
  const allCommentChildren = allChildren.filter((child) => child.taskType === "comment");
  const matchingTaskChildren = matchingChildren.filter((child) => child.taskType === "task");
  const matchingCommentChildren = matchingChildren.filter((child) => child.taskType === "comment");
  const defaultMatchingTaskChildren = allTaskChildren.filter(
    (child) => !isTaskTerminalStatus(child.status)
  );
  const defaultMatchingCommentChildren = allCommentChildren;
  const taskChildCount = allTaskChildren.length;
  const commentChildCount = allCommentChildren.length;
  const completedTaskChildCount = allTaskChildren.filter((child) => isTaskCompletedStatus(child.status)).length;
  const shouldUseFilteredMatchingChildren = hasMatchingFilters && !currentTaskIsDirectMatch;
  const rawEffectiveMatchingTaskChildren = shouldUseFilteredMatchingChildren
    ? matchingTaskChildren
    : hasMatchingFilters
      ? mergeChildrenPreservingOrder(allTaskChildren, defaultMatchingTaskChildren, matchingTaskChildren)
      : defaultMatchingTaskChildren;
  const effectiveMatchingCommentChildren = shouldUseFilteredMatchingChildren
    ? matchingCommentChildren
    : hasMatchingFilters
      ? mergeChildrenPreservingOrder(allCommentChildren, defaultMatchingCommentChildren, matchingCommentChildren)
      : defaultMatchingCommentChildren;
  // Done/terminal child tasks should never appear in the normal "matchingOnly" view —
  // they only reveal under a done branch or via "show all". Mirror that filter here so
  // `allVisibleDiffersFromMatching` correctly enables the third fold state when hidden
  // done children exist.
  const effectiveMatchingTaskChildren = rawEffectiveMatchingTaskChildren.filter(
    (child) => !isTaskTerminalStatus(child.status)
  );

  return {
    allChildren,
    allTaskChildren,
    allCommentChildren,
    matchingTaskChildren: effectiveMatchingTaskChildren,
    matchingCommentChildren: effectiveMatchingCommentChildren,
    defaultMatchingTaskChildren,
    defaultMatchingCommentChildren,
    taskChildCount,
    commentChildCount,
    completedTaskChildCount,
    hasChildren: allChildren.length > 0,
    allVisibleDiffersFromMatching:
      taskChildCount !== effectiveMatchingTaskChildren.length ||
      commentChildCount !== effectiveMatchingCommentChildren.length,
  };
}

export function getDefaultTreeTaskFoldState(
  depth: number,
  hasMatchingFilters: boolean,
  hasMatchingChildren: boolean
): TreeTaskFoldState {
  if (depth === 0) return "matchingOnly";
  if (hasMatchingFilters && hasMatchingChildren) return "matchingOnly";
  return "collapsed";
}

export function getNextTreeTaskFoldState(
  current: TreeTaskFoldState,
  allVisibleDiffersFromMatching: boolean
): TreeTaskFoldState {
  if (current === "matchingOnly") return "collapsed";
  if (current === "collapsed") {
    return allVisibleDiffersFromMatching ? "allVisible" : "matchingOnly";
  }
  return allVisibleDiffersFromMatching ? "matchingOnly" : "collapsed";
}
