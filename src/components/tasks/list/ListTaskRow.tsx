import type { ReactNode } from "react";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { TaskStatusToggle } from "@/components/tasks/task-card/TaskStatusToggle";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { cn } from "@/lib/utils";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminal } from "@/domain/content/task-state";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTranslation } from "react-i18next";
import type { TaskPost } from "@/types";
import { getTaskState } from "@/types";
import { getTaskTooltipPreview } from "@/lib/task-content-preview";
import type { Person } from "@/types/person";

interface ListTaskRowProps {
  task: TaskPost;
  currentUser?: Person;
  people: Person[];
  ancestorChain: { id: string; text: string }[];
  isKeyboardFocused: boolean;
  isInteractionBlocked: boolean;
  isProject: boolean;
  rowClassName: string;
  bodyCellClassName: string;
  contentPreview: string;
  renderStatusCell: (task: TaskPost) => ReactNode;
  renderDueDateCell: (task: TaskPost) => ReactNode;
  renderPriorityCell: (task: TaskPost, editable: boolean) => ReactNode;
  renderTagsCell: (task: TaskPost) => ReactNode;
}

export function ListTaskRow({
  task,
  currentUser,
  people,
  ancestorChain,
  isKeyboardFocused,
  isInteractionBlocked,
  isProject,
  rowClassName,
  bodyCellClassName,
  contentPreview,
  renderStatusCell,
  renderDueDateCell,
  renderPriorityCell,
  renderTagsCell,
}: ListTaskRowProps) {
  const { t } = useTranslation("tasks");
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const { focusTask } = useTaskViewServices();
  const canCompleteTask = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);

  return (
    <TaskSurface
      role="row"
      taskId={task.id}
      className={cn(
        rowClassName,
        "items-start border-b border-border hover:bg-muted/30 transition-colors",
        isTaskTerminal(getTaskState(task)) && "opacity-60",
        isLockedUntilStart && "opacity-50 grayscale",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
      )}
    >
      <div role="cell" className="min-w-0 px-2 py-2 2xl:px-3">
        <TaskStatusToggle
          task={task}
          currentUser={currentUser}
          people={people}
          buttonClassName="p-0.5"
          focusOnQuickToggle={false}
        />
      </div>
      <div role="cell" className={cn(bodyCellClassName, "min-w-0")}>
        <div className="space-y-1">
          <TaskBreadcrumbRow breadcrumbs={ancestorChain} onFocusTask={focusTask} />
          <div
            onClick={() => {
              if (!hasTextSelection()) focusTask(task.id);
            }}
            className={cn(
              `text-sm cursor-pointer break-words whitespace-pre-line line-clamp-2 overflow-hidden ${TASK_INTERACTION_STYLES.hoverText}`,
              isProject && "font-bold",
              isTaskTerminal(getTaskState(task)) && "line-through text-muted-foreground"
            )}
            title={(() => {
              const typeLabel = t("tasks.task").toLowerCase();
              const preview = getTaskTooltipPreview(task.content);
              return preview
                ? t("tasks.focusTaskWithPreview", { type: typeLabel, preview })
                : t("tasks.focusTaskTitle", { type: typeLabel });
            })()}
          >
            {contentPreview}
          </div>
        </div>
      </div>
      <div role="cell" className={cn(bodyCellClassName, "hidden 2xl:flex items-center")}>
        {renderStatusCell(task)}
      </div>
      <div role="cell" className={cn(bodyCellClassName, "flex items-center")}>
        {renderDueDateCell(task)}
      </div>
      <div role="cell" className={cn(bodyCellClassName, "flex items-center")}>
        {renderPriorityCell(task, canCompleteTask)}
      </div>
      <div role="cell" className={cn(bodyCellClassName, "min-w-0")}>
        {renderTagsCell(task)}
      </div>
    </TaskSurface>
  );
}
