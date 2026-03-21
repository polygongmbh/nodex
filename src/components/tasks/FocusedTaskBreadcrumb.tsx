import { ReactNode, useMemo } from "react";
import { ChevronUp } from "lucide-react";
import { Task } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface FocusedTaskBreadcrumbProps {
  allTasks: Task[];
  focusedTaskId?: string | null;
  className?: string;
  rightSlot?: ReactNode;
}

export function FocusedTaskBreadcrumb({
  allTasks,
  focusedTaskId,
  className,
  rightSlot,
}: FocusedTaskBreadcrumbProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const focusTask = (taskId: string | null) => {
    void dispatchFeedInteraction({ type: "task.focus.change", taskId });
  };
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
  const parentFocusId = useMemo(() => {
    if (!focusedTaskId) return null;
    const focusedTask = allTasks.find((task) => task.id === focusedTaskId);
    return focusedTask?.parentId || null;
  }, [allTasks, focusedTaskId]);

  return (
    <div
      data-onboarding="focused-breadcrumb"
      className={cn(
        "w-full h-12 border-b border-border/80 bg-muted/60 px-2 sm:px-3 flex items-center gap-3 shadow-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={() => focusTask(parentFocusId)}
        disabled={!focusedTaskId}
        aria-label={t("breadcrumbs.up")}
        title={t("breadcrumbs.goToParent")}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
          focusedTaskId
            ? "text-foreground/85 hover:text-foreground hover:bg-background/70"
            : "text-muted-foreground/60 cursor-not-allowed"
        )}
      >
        <ChevronUp className="w-3.5 h-3.5" />
        <span>{t("breadcrumbs.up")}</span>
      </button>
      <div className="min-w-0 flex flex-1 items-center gap-1.5 overflow-hidden text-sm text-foreground/80 whitespace-nowrap">
        <button
          onClick={() => focusTask(null)}
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-left transition-colors hover:text-foreground hover:bg-background/70",
            path.length === 0 && "text-foreground font-semibold"
          )}
          type="button"
          title={t("breadcrumbs.showAllTasks")}
        >
          {t("breadcrumbs.allTasks")}
        </button>
        {path.map((task, index) => (
          <span key={task.id} className="flex min-w-0 shrink items-center gap-1">
            <span className="shrink-0 text-foreground/50">/</span>
            <button
              onClick={() => focusTask(task.id)}
              className={cn(
                "max-w-full shrink truncate rounded px-1.5 py-0.5 text-left transition-colors hover:text-foreground hover:bg-background/70",
                index === path.length - 1 && "text-foreground font-semibold"
              )}
              type="button"
              title={task.content}
            >
              {task.content}
            </button>
          </span>
        ))}
      </div>
      {rightSlot && <div className="ml-auto flex items-center gap-2 text-foreground/80">{rightSlot}</div>}
    </div>
  );
}
