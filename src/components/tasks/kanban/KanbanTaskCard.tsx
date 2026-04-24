import { Calendar, Clock, Layers, Lock } from "lucide-react";
import { ScrollableTaskTagChipRow, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskPrioritySelect } from "@/components/tasks/TaskMetadataEditors";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { TASK_CHIP_STYLES } from "@/lib/task-interaction-styles";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { getDueDateColorClass } from "@/domain/content/task-sorting";
import { canUserChangeTaskStatus } from "@/domain/content/task-permissions";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { hasTextSelection } from "@/lib/click-intent";
import { getTaskDateTypeLabel, isTaskLockedUntilStart } from "@/lib/task-dates";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useTranslation } from "react-i18next";
import { getTaskTooltipPreview } from "@/lib/task-content-preview";
import { format } from "date-fns";
import type { Task, TaskStatus } from "@/types";
import type { Person } from "@/types/person";

interface KanbanTaskCardProps {
  task: Task;
  currentUser?: Person;
  people: Person[];
  displayStatus: TaskStatus;
  ancestorChain: { id: string; text: string }[];
  showContext: boolean;
  compactTaskCardsEnabled: boolean;
  isKeyboardFocused: boolean;
  isInteractionBlocked: boolean;
  isPendingPublish: boolean;
  hasChildren: (taskId: string) => boolean;
}

export function KanbanTaskCard({
  task,
  currentUser,
  people,
  displayStatus,
  ancestorChain,
  showContext,
  compactTaskCardsEnabled,
  isKeyboardFocused,
  isInteractionBlocked,
  isPendingPublish,
  hasChildren,
}: KanbanTaskCardProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const dueDateColor = getDueDateColorClass(task.dueDate, displayStatus);
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const canChangeStatus = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  const hasMetadataChips =
    !compactTaskCardsEnabled && hasTaskMetadataChips(task, activeRelayCount);

  const tooltipPreview = getTaskTooltipPreview(task.content);
  const tooltipTypeLabel = t("tasks.task").toLowerCase();
  const surfaceTitle = tooltipPreview
    ? t("tasks.focusTaskWithPreview", { type: tooltipTypeLabel, preview: tooltipPreview })
    : t("tasks.focusTaskTitle", { type: tooltipTypeLabel });

  return (
    <TaskSurface
      taskId={task.id}
      title={surfaceTitle}
      onClick={() => {
        if (!hasTextSelection() && hasChildren(task.id)) {
          focusTask(task.id);
        }
      }}
      className={cn(
        `relative min-w-0 bg-card border border-border rounded-lg p-3 shadow-sm transition-shadow cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
        !canChangeStatus && "border-dashed border-muted-foreground/60 bg-muted/40",
        isTaskTerminalStatus(displayStatus) && "opacity-70",
        isLockedUntilStart && "opacity-50 grayscale",
        isKeyboardFocused && "ring-2 ring-primary ring-offset-1 ring-offset-background"
      )}
    >
      {!canChangeStatus ? (
        <div
          className="absolute right-2 top-2 rounded-full bg-muted/80 p-1 text-muted-foreground"
          title={t("tasks.readOnly")}
          aria-label={t("tasks.readOnly")}
        >
          <Lock className="h-3 w-3" />
        </div>
      ) : null}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          {!compactTaskCardsEnabled && showContext ? (
            <TaskBreadcrumbRow
              breadcrumbs={ancestorChain}
              onFocusTask={focusTask}
              className="mb-2"
            />
          ) : null}
          <div className="flex items-start gap-2">
            <div
              className={cn(
                `min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-line line-clamp-2 overflow-hidden ${TASK_INTERACTION_STYLES.hoverText}`,
                isTaskTerminalStatus(displayStatus) && "line-through text-muted-foreground"
              )}
            >
              {linkifyContent(task.content, (tag) => {
                void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
              }, {
                plainHashtags: isTaskTerminalStatus(displayStatus),
                people,
                disableStandaloneEmbeds: true,
              })}
            </div>
            {typeof task.priority === "number" ? (
              <TaskPrioritySelect
                id={`kanban-priority-${task.id}`}
                taskId={canChangeStatus ? task.id : undefined}
                priority={task.priority}
                stopPropagation
                title={`Priority ${task.priority}`}
                className={cn(
                  "ml-auto focus:outline-none",
                  TASK_CHIP_STYLES.priority,
                  canChangeStatus && "cursor-pointer hover:bg-warning/20",
                  !canChangeStatus && "cursor-not-allowed opacity-60"
                )}
              />
            ) : null}
          </div>
          {task.dueDate ? (
            <div
              className={cn("flex items-center gap-1.5 text-xs mt-2", dueDateColor)}
              data-testid={`kanban-due-row-${task.id}`}
              title={`${getTaskDateTypeLabel(task.dateType)}: ${format(task.dueDate, "MMM d, yyyy")}${task.dueTime ? ` ${task.dueTime}` : ""}`}
            >
              <Calendar className="w-3 h-3" />
              <span className="uppercase tracking-wide">{getTaskDateTypeLabel(task.dateType)}</span>
              <span>{format(task.dueDate, "MMM d")}</span>
              {task.dueTime ? (
                <>
                  <Clock className="w-3 h-3" />
                  <span>{task.dueTime}</span>
                </>
              ) : null}
            </div>
          ) : null}
          {hasMetadataChips ? (
            <ScrollableTaskTagChipRow
              task={task}
              className="mt-2"
              showEmptyPlaceholder={false}
              testId={`kanban-chip-row-${task.id}`}
            />
          ) : null}
          {isPendingPublish ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
                }}
                className="text-xs font-medium text-warning hover:text-warning/80"
                title={t("composer:toasts.actions.undo")}
              >
                {t("composer:toasts.actions.undo")}
              </button>
            </div>
          ) : null}
          {!compactTaskCardsEnabled && hasChildren(task.id) ? (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
              <Layers className="w-3 h-3" />
              <span>{t("kanban.hasSubtasks")}</span>
            </div>
          ) : null}
        </div>
        {/* Assignee avatars - bottom right of the card without growing it vertically */}
        <div className="flex-shrink-0 self-end">
          <TaskAssigneeAvatars task={task} />
        </div>
      </div>
    </TaskSurface>
  );
}
