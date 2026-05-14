import type { Post } from "@/types";
import { getTaskState, isTaskPost } from "@/types";
import { isTaskCompleted, isTaskTerminal } from "@/domain/content/task-state";

export type TreeTaskFoldState = "collapsed" | "matchingOnly" | "allVisible";

interface DeriveTreeTaskItemChildrenParams {
  allChildren: Post[];
  matchingChildren: Post[];
  hasMatchingFilters: boolean;
  currentTaskIsDirectMatch: boolean;
  parentIsTerminal?: boolean;
}

export interface TreeTaskItemChildrenState {
  allChildren: Post[];
  allTaskChildren: Post[];
  allCommentChildren: Post[];
  matchingTaskChildren: Post[];
  matchingCommentChildren: Post[];
  defaultMatchingTaskChildren: Post[];
  defaultMatchingCommentChildren: Post[];
  taskChildCount: number;
  commentChildCount: number;
  completedTaskChildCount: number;
  hasChildren: boolean;
  allVisibleDiffersFromMatching: boolean;
}

function mergeChildrenPreservingOrder(allChildren: Post[], primaryChildren: Post[], extraChildren: Post[]): Post[] {
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
  const allTaskChildren = allChildren.filter((child) => isTaskPost(child));
  const allCommentChildren = allChildren.filter((child) => !isTaskPost(child));
  const matchingTaskChildren = matchingChildren.filter((child) => isTaskPost(child));
  const matchingCommentChildren = matchingChildren.filter((child) => !isTaskPost(child));
  const defaultMatchingTaskChildren = allTaskChildren.filter(
    (child) => !isTaskTerminal(getTaskState(child))
  );
  const defaultMatchingCommentChildren = allCommentChildren;
  const taskChildCount = allTaskChildren.length;
  const commentChildCount = allCommentChildren.length;
  const completedTaskChildCount = allTaskChildren.filter((child) => isTaskCompleted(getTaskState(child))).length;
  const shouldUseFilteredMatchingChildren = hasMatchingFilters && !currentTaskIsDirectMatch;
  const noFilterTaskBaseline = parentIsTerminal ? allTaskChildren : defaultMatchingTaskChildren;
  const noFilterCommentBaseline = defaultMatchingCommentChildren;
  const rawEffectiveMatchingTaskChildren = shouldUseFilteredMatchingChildren
    ? matchingTaskChildren
    : hasMatchingFilters
      ? mergeChildrenPreservingOrder(allTaskChildren, noFilterTaskBaseline, matchingTaskChildren)
      : noFilterTaskBaseline;
  const effectiveMatchingCommentChildren = shouldUseFilteredMatchingChildren
    ? matchingCommentChildren
    : hasMatchingFilters
      ? mergeChildrenPreservingOrder(allCommentChildren, noFilterCommentBaseline, matchingCommentChildren)
      : noFilterCommentBaseline;
  // Done/terminal child tasks should never appear in the normal "matchingOnly" view —
  // they only reveal under a done branch or via "show all". Mirror that filter here so
  // `allVisibleDiffersFromMatching` correctly enables the third fold state when hidden
  // done children exist. When the parent is itself terminal, done children stay visible
  // because the user has explicitly navigated into a done branch.
  const effectiveMatchingTaskChildren = parentIsTerminal
    ? rawEffectiveMatchingTaskChildren
    : rawEffectiveMatchingTaskChildren.filter((child) => !isTaskTerminal(getTaskState(child)));

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
