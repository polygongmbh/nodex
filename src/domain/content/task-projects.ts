import { isTaskTerminal } from "@/domain/content/task-state";
import type { Post } from "@/types";
import { getTaskState, isTaskPost } from "@/types";

// A task is a "project" when at least one of its task-typed subtasks is not in
// a terminal state. This drives bolding, the kanban click affordance (project
// cards stay in kanban; non-projects jump to the timeline), and the status
// view's projects row — a unified rule across views.
//
// The "Projects Only" depth filter uses a different, broader rule (any subtask
// counts) and intentionally does NOT go through this helper.

export function isProjectFromChildrenMap(
  taskId: string,
  childrenByParentId: Map<string | undefined, Post[]>
): boolean {
  const children = childrenByParentId.get(taskId) || [];
  return children.some(
    (child) => isTaskPost(child) && !isTaskTerminal(getTaskState(child))
  );
}

export function makeIsProject(allTasks: Post[]): (taskId: string) => boolean {
  return (taskId) =>
    allTasks.some(
      (task) =>
        isTaskPost(task) &&
        task.parentId === taskId &&
        !isTaskTerminal(getTaskState(task))
    );
}
