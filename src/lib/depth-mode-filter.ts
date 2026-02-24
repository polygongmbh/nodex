export type DepthMode = "1" | "2" | "3" | "all" | "leaves" | "projects";

interface DepthModeTask {
  id: string;
  parentId?: string | null;
}

interface FilterTasksByDepthModeInput<TTask extends DepthModeTask> {
  tasks: TTask[];
  depthMode: DepthMode;
  focusedTaskId?: string | null;
  getDepth: (taskId: string) => number;
  hasChildren: (taskId: string) => boolean;
}

function matchesDepthMode<TTask extends DepthModeTask>(
  task: TTask,
  depthMode: DepthMode,
  focusedTaskId: string | null | undefined,
  getDepth: (taskId: string) => number,
  hasChildren: (taskId: string) => boolean
): boolean {
  const depth = focusedTaskId
    ? getDepth(task.id) - getDepth(focusedTaskId)
    : getDepth(task.id);

  if (depthMode === "leaves") {
    return !hasChildren(task.id);
  }
  if (depthMode === "projects") {
    return !task.parentId && hasChildren(task.id);
  }
  if (depthMode !== "all") {
    const maxDepth = Number.parseInt(depthMode, 10);
    if (!Number.isNaN(maxDepth)) {
      return depth <= maxDepth;
    }
  }

  return true;
}

export function filterTasksByDepthMode<TTask extends DepthModeTask>({
  tasks,
  depthMode,
  focusedTaskId,
  getDepth,
  hasChildren,
}: FilterTasksByDepthModeInput<TTask>): TTask[] {
  const filtered = tasks.filter((task) =>
    matchesDepthMode(task, depthMode, focusedTaskId, getDepth, hasChildren)
  );

  if (depthMode === "projects" && filtered.length === 0) {
    return tasks;
  }

  return filtered;
}
