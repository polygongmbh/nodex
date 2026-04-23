import { TaskStateIcon } from "@/components/tasks/task-state-ui";
import { getTaskStateRegistry } from "@/domain/task-states/task-state-config";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { useTaskStatusMenu } from "@/components/tasks/task-card/use-task-status-menu";
import { cn } from "@/lib/utils";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { useTranslation } from "react-i18next";
import type { Task, TaskStatus } from "@/types";
import type { Person } from "@/types/person";

interface ListTaskRowProps {
  task: Task;
  currentUser?: Person;
  people: Person[];
  ancestorChain: { id: string; text: string }[];
  isKeyboardFocused: boolean;
  isInteractionBlocked: boolean;
  getStatusToggleHint: (status?: Task["status"]) => string;
  rowClassName: string;
  bodyCellClassName: string;
  contentPreview: string;
  renderStatusCell: (task: Task) => ReactNode;
  renderDueDateCell: (task: Task) => ReactNode;
  renderPriorityCell: (task: Task, editable: boolean) => ReactNode;
  renderTagsCell: (task: Task) => ReactNode;
}

export function ListTaskRow({
  task,
  currentUser,
  people,
  ancestorChain,
  isKeyboardFocused,
  isInteractionBlocked,
  getStatusToggleHint,
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
  const {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
    focusTask,
  } = useTaskStatusMenu({
    task,
    currentUser,
    people,
    isInteractionBlocked,
    getStatusToggleHint,
    focusOnQuickToggle: false,
  });

  return (
    <TaskSurface
      role="row"
      taskId={task.id}
      className={cn(
        rowClassName,
        "items-start border-b border-border hover:bg-muted/30 transition-colors",
        isTaskTerminalStatus(task.status) && "opacity-60",
        isLockedUntilStart && "opacity-50 grayscale",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-primary/5"
      )}
    >
      <div role="cell" className="min-w-0 px-2 py-2 2xl:px-3">
        <DropdownMenu
          open={statusMenuOpen}
          onOpenChange={handleOpenChange}
        >
          <DropdownMenuTrigger asChild>
            <button
              {...triggerProps}
              disabled={!canCompleteTask}
              aria-label={t("tasks.actions.setStatus")}
              title={statusButtonTitle}
              className={cn(
                "p-0.5 rounded transition-colors",
                canCompleteTask ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
              )}
            >
              <TaskStateIcon status={task.status} />
            </button>
          </DropdownMenuTrigger>
          {canCompleteTask ? (
            <DropdownMenuContent align="start">
              {getTaskStateRegistry().map((state) => (
                <DropdownMenuItem
                  key={state.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    dispatchStatusChange(state.id as TaskStatus);
                  }}
                  className={cn((task.status || "open") === state.id && "bg-muted")}
                >
                  <TaskStateIcon status={state.type} size="w-4 h-4" className="mr-2" />
                  {t(`status.${state.id}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
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
              isTaskTerminalStatus(task.status) && "line-through text-muted-foreground"
            )}
            title={t("tasks.focusTaskTitle", { type: t("tasks.task").toLowerCase() })}
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
