import { ReactNode, useMemo } from "react";
import { Task } from "@/types";
import { cn } from "@/lib/utils";

interface FocusedTaskBreadcrumbProps {
  allTasks: Task[];
  focusedTaskId?: string | null;
  onFocusTask?: (taskId: string | null) => void;
  className?: string;
  rightSlot?: ReactNode;
}

export function FocusedTaskBreadcrumb({
  allTasks,
  focusedTaskId,
  onFocusTask,
  className,
  rightSlot,
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

  return (
    <div
      className={cn(
        "w-full border-b border-border bg-background/95 px-4 py-2 flex items-center gap-3",
        className
      )}
    >
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button
          onClick={() => onFocusTask?.(null)}
          className={cn(
            "px-1 py-0.5 transition-colors hover:text-foreground",
            path.length === 0 && "text-foreground font-medium"
          )}
          type="button"
        >
          All Tasks
        </button>
        {path.map((task, index) => (
          <span key={task.id} className="flex items-center gap-1 min-w-0">
            <span>/</span>
            <button
              onClick={() => onFocusTask?.(task.id)}
              className={cn(
                "truncate max-w-[220px] px-1 py-0.5 transition-colors hover:text-foreground",
                index === path.length - 1 && "text-foreground font-medium"
              )}
              type="button"
              title={task.content}
            >
              {task.content.slice(0, 80)}
              {task.content.length > 80 ? "..." : ""}
            </button>
          </span>
        ))}
      </div>
      {rightSlot && <div className="ml-auto flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
