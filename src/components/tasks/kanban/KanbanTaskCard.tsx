import { Calendar, Clock, Layers, Lock } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { ScrollableTaskTagChipRow, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskPrioritySelect } from "@/components/tasks/TaskMetadataEditors";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
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
  dragHandleProps?: DraggableProvidedDragHandleProps;
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
  dragHandleProps,
}: KanbanTaskCardProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const dueDateColor = getDueDateColorClass(task.dueDate, displayStatus);
  const isLockedUntilStart = isTaskLockedUntilStart(task);
  const canChangeStatus = !isInteractionBlocked && canUserChangeTaskStatus(task, currentUser);
  const hasMetadataChips =
    !compactTaskCardsEnabled && hasTaskMetadataChips(task, activeRelayCount);

  return (
    <TaskSurface
      taskId={task.id}
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
      {dragHandleProps ? (
        <div
          {...dragHandleProps}
          aria-hidden="true"
          data-testid={`kanban-card-handle-${task.id}`}
          className="absolute inset-0 rounded-lg"
        />
      ) : null}
      {!canChangeStatus ? (
        <div
          className="absolute right-2 top-2 z-20 rounded-full bg-muted/80 p-1 text-muted-foreground"
          title={t("tasks.readOnly")}
          aria-label={t("tasks.readOnly")}
        >
          <Lock className="h-3 w-3" />
        </div>
      ) : null}
      <div className="relative z-10">
        {!compactTaskCardsEnabled && showContext ? (
          <div {...dragHandleProps}>
            <TaskBreadcrumbRow
              breadcrumbs={ancestorChain}
              onFocusTask={focusTask}
              className="mb-2"
            />
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <div
            data-testid={`kanban-card-text-${task.id}`}
            className={cn(
              `min-w-0 flex-1 cursor-text select-text text-sm leading-relaxed whitespace-pre-line line-clamp-2 overflow-hidden ${TASK_INTERACTION_STYLES.hoverText}`,
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
            <div {...dragHandleProps}>
              <TaskPrioritySelect
                id={`kanban-priority-${task.id}`}
                taskId={task.id}
                priority={task.priority}
                ariaLabel={t("composer.labels.priority")}
                disabled={!canChangeStatus}
                stopPropagation
                className={cn(
                  "ml-auto h-6 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning focus:outline-none",
                  canChangeStatus && "cursor-pointer hover:bg-warning/20",
                  !canChangeStatus && "cursor-not-allowed opacity-60"
                )}
              />
            </div>
          ) : null}
        </div>
        {task.dueDate ? (
          <div
            {...dragHandleProps}
            className={cn("mt-2 flex items-center gap-1.5 text-xs", dueDateColor)}
            data-testid={`kanban-due-row-${task.id}`}
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
          <div {...dragHandleProps}>
            <ScrollableTaskTagChipRow
              task={task}
              className="mt-2"
              showEmptyPlaceholder={false}
              testId={`kanban-chip-row-${task.id}`}
            />
          </div>
        ) : null}
        {isPendingPublish ? (
          <div className="mt-2" {...dragHandleProps}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void dispatchFeedInteraction({ type: "task.undoPendingPublish", taskId: task.id });
              }}
              className="text-xs font-medium text-warning hover:text-warning/80"
              title={t("toasts.actions.undo")}
            >
              {t("toasts.actions.undo")}
            </button>
          </div>
        ) : null}
        {!compactTaskCardsEnabled && hasChildren(task.id) ? (
          <div {...dragHandleProps} className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="w-3 h-3" />
            <span>{t("kanban.hasSubtasks")}</span>
          </div>
        ) : null}
      </div>
    </TaskSurface>
  );
}
