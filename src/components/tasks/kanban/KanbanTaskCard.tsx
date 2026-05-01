import { Calendar, Clock, Layers, Lock } from "lucide-react";
import { ScrollableTaskTagChipRow, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskPrioritySelect } from "@/components/tasks/TaskMetadataEditors";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { TASK_CHIP_STYLES } from "@/lib/task-interaction-styles";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { getDueDateColorClass } from "@/domain/content/task-sorting";
import { canUserChangeTaskStatus, getTaskStatusChangeBlockedReason } from "@/domain/content/task-permissions";
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
import { notifyTaskActionBlocked } from "@/lib/notifications";
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
  const { onBlockedInteractionAttempt } = useFeedTaskViewModel();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const dueDateColor = getDueDateColorClass(task.dueDate, displayStatus);
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const canChangeStatus = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  // Priority editing is also disabled for tasks in terminal states (done/closed) — render as a
  // disabled-looking chip to avoid the overhead of a select that can't change anything meaningful.
  const canEditPriority = canChangeStatus && !isTaskTerminalStatus(displayStatus);
  const surfaceBlockedFeedback = () => {
    if (isInteractionBlocked && onBlockedInteractionAttempt) {
      onBlockedInteractionAttempt();
      return;
    }
    notifyTaskActionBlocked(getTaskStatusChangeBlockedReason(task, currentUser, isInteractionBlocked, people));
  };
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
      {/* Priority chip pinned to the top-right corner so the content column never has to share width with it. */}
      {typeof task.priority === "number" ? (
        <div
          className="absolute right-2 top-2 z-10"
          onClickCapture={canChangeStatus ? undefined : (e) => {
            // Soft-disabled: still surface feedback when tapped on touch devices.
            e.preventDefault();
            e.stopPropagation();
            surfaceBlockedFeedback();
          }}
        >
          <TaskPrioritySelect
            id={`kanban-priority-${task.id}`}
            taskId={canChangeStatus ? task.id : undefined}
            priority={task.priority}
            stopPropagation
            className={cn(
              "px-1.5 py-0.5 text-sm focus:outline-none",
              TASK_CHIP_STYLES.priority,
              "text-sm",
              canChangeStatus ? "cursor-pointer hover:bg-warning/20" : "cursor-not-allowed opacity-60"
            )}
          />
        </div>
      ) : null}
      {!compactTaskCardsEnabled && showContext ? (
        <TaskBreadcrumbRow
          breadcrumbs={ancestorChain}
          onFocusTask={focusTask}
          className={cn("mb-2", typeof task.priority === "number" && "pr-12")}
        />
      ) : null}
      <div
        className={cn(
          `text-sm leading-relaxed whitespace-pre-line line-clamp-2 overflow-hidden ${TASK_INTERACTION_STYLES.hoverText}`,
          // Reserve space for the absolutely-positioned priority chip on the first line(s).
          typeof task.priority === "number" && "pr-14",
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
      {/*
       * Bottom-right cluster (lock + assignee avatars) sits inline at the end
       * of the content flow, aligned to the right so it tucks into the bottom
       * corner without forcing its own row.
       */}
      <div className="mt-2 flex items-center justify-end gap-1.5">
        {hasMetadataChips ? (
          <ScrollableTaskTagChipRow
            task={task}
            className="mr-auto"
            showEmptyPlaceholder={false}
            testId={`kanban-chip-row-${task.id}`}
          />
        ) : null}
        {!compactTaskCardsEnabled && hasChildren(task.id) ? (
          <span className="mr-auto text-xs text-muted-foreground flex items-center gap-1">
            <Layers className="w-3 h-3" />
            <span>{t("kanban.hasSubtasks")}</span>
          </span>
        ) : null}
        {isPendingPublish ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
            }}
            className="mr-auto text-xs font-medium text-warning hover:text-warning/80"
            title={t("composer:toasts.actions.undo")}
          >
            {t("composer:toasts.actions.undo")}
          </button>
        ) : null}
        {!canChangeStatus ? (
          <div
            className="rounded-full bg-muted/80 p-1 text-muted-foreground"
            title={t("tasks.readOnly")}
            aria-label={t("tasks.readOnly")}
          >
            <Lock className="h-3 w-3" />
          </div>
        ) : null}
        <TaskAssigneeAvatars task={task} />
      </div>
    </TaskSurface>
  );
}
