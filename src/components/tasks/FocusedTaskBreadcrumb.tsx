import { useMemo } from "react";
import { Task } from "@/types";

interface FocusedTaskBreadcrumbProps {
  allTasks: Task[];
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  className?: string;
}

export function FocusedTaskBreadcrumb({
  allTasks,
  focusedTaskId,
  onFocusTask,
  className,
}: FocusedTaskBreadcrumbProps) {
  const path = useMemo(() => {
    if (!focusedTaskId) return [] as Task[];
    const byId = new Map(allTasks.map((task) => [task.id, task]));
    const chain: Task[] = [];
    const visited = new Set<string>();
    let current = byId.get(focusedTaskId);

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current);
      if (!current.parentId) break;
      current = byId.get(current.parentId);
    }

    return chain;
  }, [allTasks, focusedTaskId]);

  if (!focusedTaskId || path.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button
          onClick={() => onFocusTask?.(null)}
          className="rounded px-1 py-0.5 hover:text-foreground hover:bg-muted/70 transition-colors"
          type="button"
        >
          All Tasks
        </button>
        {path.map((task) => (
          <span key={task.id} className="flex items-center gap-1 min-w-0">
            <span>/</span>
            <button
              onClick={() => onFocusTask?.(task.id)}
              className="truncate max-w-[220px] rounded px-1 py-0.5 hover:text-foreground hover:bg-muted/70 transition-colors"
              type="button"
              title={task.content}
            >
              {task.content.slice(0, 80)}
              {task.content.length > 80 ? "..." : ""}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
