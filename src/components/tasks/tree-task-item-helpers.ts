import type { Task } from "@/types";
import { isTaskCompletedStatus, isTaskTerminalStatus } from "@/domain/content/task-status";

export type TreeTaskFoldState = "collapsed" | "matchingOnly" | "allVisible";

interface DeriveTreeTaskItemChildrenParams {
  taskId: string;
  allTasks: Task[];
  filteredChildren: Task[];
  hasActiveFilters: boolean;
  childrenMap?: Map<string | undefined, Task[]>;
}

export interface TreeTaskItemChildrenState {
  allChildren: Task[];
  allTaskChildren: Task[];
  allCommentChildren: Task[];
  filteredTaskChildren: Task[];
  filteredCommentChildren: Task[];
  defaultMatchingTaskChildren: Task[];
  defaultMatchingCommentChildren: Task[];
  taskChildCount: number;
  commentChildCount: number;
  completedTaskChildCount: number;
  hasChildren: boolean;
  allVisibleDiffersFromMatching: boolean;
}

export function deriveTreeTaskItemChildren({
  taskId,
  allTasks,
  filteredChildren,
  hasActiveFilters,
  childrenMap,
}: DeriveTreeTaskItemChildrenParams): TreeTaskItemChildrenState {
  const allChildren = childrenMap?.get(taskId) || allTasks.filter((candidate) => candidate.parentId === taskId);
  const allTaskChildren = allChildren.filter((child) => child.taskType === "task");
  const allCommentChildren = allChildren.filter((child) => child.taskType === "comment");
  const filteredTaskChildren = filteredChildren.filter((child) => child.taskType === "task");
  const filteredCommentChildren = filteredChildren.filter((child) => child.taskType === "comment");
  const defaultMatchingTaskChildren = allTaskChildren.filter(
    (child) => !isTaskTerminalStatus(child.status)
  );
  const defaultMatchingCommentChildren = allCommentChildren;
  const taskChildCount = allTaskChildren.length;
  const commentChildCount = allCommentChildren.length;
  const completedTaskChildCount = allTaskChildren.filter((child) => isTaskCompletedStatus(child.status)).length;
  const matchingTaskCount = hasActiveFilters ? filteredTaskChildren.length : defaultMatchingTaskChildren.length;
  const matchingCommentCount = hasActiveFilters ? filteredCommentChildren.length : defaultMatchingCommentChildren.length;

  return {
    allChildren,
    allTaskChildren,
    allCommentChildren,
    filteredTaskChildren,
    filteredCommentChildren,
    defaultMatchingTaskChildren,
    defaultMatchingCommentChildren,
    taskChildCount,
    commentChildCount,
    completedTaskChildCount,
    hasChildren: allChildren.length > 0,
    allVisibleDiffersFromMatching:
      taskChildCount !== matchingTaskCount || commentChildCount !== matchingCommentCount,
  };
}

export function getNextTreeTaskFoldState(
  current: TreeTaskFoldState,
  allVisibleDiffersFromMatching: boolean
): TreeTaskFoldState {
  if (current === "matchingOnly") return "collapsed";
  if (current === "collapsed") {
    return allVisibleDiffersFromMatching ? "allVisible" : "matchingOnly";
  }
  return "matchingOnly";
}
