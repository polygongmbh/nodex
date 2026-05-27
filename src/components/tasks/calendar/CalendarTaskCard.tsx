import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { hasTextSelection } from "@/lib/click-intent";
import { cn } from "@/lib/utils";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { getAuthorColor } from "@/lib/author-color";
import { getTaskDisabledClasses } from "@/lib/task-style";
import { shouldCollapseTaskContent, TASK_CONTENT_COLLAPSED_CLASS } from "@/lib/task-content-preview";
import { TaskShowMoreToggle } from "@/components/tasks/task-card/TaskShowMoreToggle";
import { getFocusTaskTooltip } from "@/lib/task-focus-tooltip";
import { renderTaskContentWithProjectHeading } from "@/lib/linkify";
import { useTaskMediaAttachments } from "@/lib/use-task-media-attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getTaskState,
  isCalendarEventPost,
  type Post,
} from "@/types";
import type { Person } from "@/types/person";
import { isTaskTerminal } from "@/domain/content/task-state";
import {
  getTaskStateRegistry,
  resolveTaskStateFromStatus,
} from "@/domain/task-states/task-state-config";
import { TaskStateIcon, TaskStateDefIcon } from "@/components/tasks/task-state-ui";
import { TaskAttachmentList } from "@/components/tasks/TaskAttachmentList";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { TaskTagChipRow, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskBreadcrumbRow } from "@/components/tasks/task-card/TaskBreadcrumbRow";
import { useTaskStatusMenu } from "@/components/tasks/task-card/use-task-status-menu";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { CalendarTaskTimeRow } from "./CalendarTaskTimeRow";

interface CalendarTaskCardProps {
  task: Post;
  selectedDate: Date | null;
  ancestorChain: { id: string; text: string }[];
  isProject: boolean;
  hasChildren: boolean;
  currentUser?: Person;
  people: Person[];
  activeRelayCount: number;
  onOpenMedia: (taskId: string, url: string) => void;
}

export function CalendarTaskCard({
  task,
  selectedDate,
  ancestorChain,
  isProject,
  hasChildren,
  currentUser,
  people,
  activeRelayCount,
  onOpenMedia,
}: CalendarTaskCardProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
    currentItemRef,
  } = useTaskStatusMenu({
    task,
    currentUser,
    people,
    focusOnQuickToggle: hasChildren,
  });

  const authorColor = getAuthorColor(task.author);
  const hasCollapsibleContent = shouldCollapseTaskContent(task.content);
  const taskState = getTaskState(task);
  const isEvent = isCalendarEventPost(task);

  const { mediaCaptionByUrl, attachmentsWithoutInlineEmbeds } = useTaskMediaAttachments(task);

  const cardTooltip = getFocusTaskTooltip(t, task);

  return (
    <div
      data-task-id={task.id}
      onClick={() => {
        if (!hasTextSelection() && hasChildren) {
          focusTask(task.id);
        }
      }}
      title={cardTooltip}
      className={cn(
        `p-3 rounded-lg border border-border border-l-4 border-l-transparent bg-card transition-colors cursor-pointer ${TASK_INTERACTION_STYLES.cardSurface}`,
        getTaskDisabledClasses(task)
      )}
      style={{ borderLeftColor: authorColor.accent }}
    >
      {ancestorChain.length > 0 && (
        <TaskBreadcrumbRow
          breadcrumbs={ancestorChain}
          onFocusTask={focusTask}
          className="flex-wrap mb-2"
        />
      )}
      <div className="flex items-start gap-2">
        {isEvent ? (
          <span
            title={t("tasks.event.label")}
            aria-label={t("tasks.event.label")}
            className="flex-shrink-0 inline-flex items-center justify-center p-0.5"
          >
            <CalendarIcon className="w-5 h-5 text-muted-foreground" />
          </span>
        ) : (
          <DropdownMenu open={statusMenuOpen} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                {...triggerProps}
                disabled={!canCompleteTask}
                aria-label={t("tasks.actions.setStatus")}
                title={statusButtonTitle}
                className={cn(
                  "flex-shrink-0 p-0.5 rounded transition-colors touch-manipulation",
                  canCompleteTask ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-50"
                )}
              >
                <TaskStateIcon status={taskState} />
              </button>
            </DropdownMenuTrigger>
            {canCompleteTask && (
              <DropdownMenuContent align="start">
                {getTaskStateRegistry().map((state) => {
                  const isCurrent = resolveTaskStateFromStatus(taskState).id === state.id;
                  return (
                    <DropdownMenuItem
                      key={state.id}
                      ref={isCurrent ? currentItemRef : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatchStatusChange(state.id);
                      }}
                      className={cn(isCurrent && "bg-muted")}
                    >
                      <TaskStateDefIcon state={state} className="mr-2" />
                      {state.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        )}
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-sm",
              hasCollapsibleContent && !isContentExpanded
                ? TASK_CONTENT_COLLAPSED_CLASS
                : "whitespace-pre-wrap",
              isTaskTerminal(taskState) && "line-through text-muted-foreground"
            )}
          >
            {renderTaskContentWithProjectHeading(
              task.content,
              isProject,
              (tag) => {
                void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
              },
              {
                plainHashtags: isTaskTerminal(taskState),
                people,
                disableStandaloneEmbeds: hasCollapsibleContent && !isContentExpanded,
                onStandaloneMediaClick: (url) => onOpenMedia(task.id, url),
                getStandaloneMediaCaption: (url) =>
                  mediaCaptionByUrl.get(url.trim().toLowerCase()),
              }
            )}
          </div>
          {hasCollapsibleContent && (
            <TaskShowMoreToggle
              isExpanded={isContentExpanded}
              onToggle={() => setIsContentExpanded((prev) => !prev)}
            />
          )}
          <TaskAttachmentList
            attachments={attachmentsWithoutInlineEmbeds}
            className="mt-1.5 space-y-1"
            onMediaClick={(url) => onOpenMedia(task.id, url)}
          />
          <CalendarTaskTimeRow task={task} selectedDate={selectedDate} accent={authorColor.accent} />
          {(typeof task.priority === "number" || hasTaskMetadataChips(task, activeRelayCount)) && (
            <TaskTagChipRow
              task={task}
              priority={task.priority}
              className="mt-1"
              tagClassName="px-1 py-0.5 rounded text-xs"
              showEmptyPlaceholder={false}
              testId={`calendar-chip-row-${task.id}`}
            />
          )}
        </div>
        <div className="flex-shrink-0 self-end">
          <TaskAssigneeAvatars task={task} />
        </div>
      </div>
    </div>
  );
}

