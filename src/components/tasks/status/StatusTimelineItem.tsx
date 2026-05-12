import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskStateIcon, TaskStateDefIcon } from "@/components/tasks/task-state-ui";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaskStatusMenu } from "@/components/tasks/task-card/use-task-status-menu";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedPersonLookup } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";
import {
  getTaskStateRegistry,
  resolveTaskStateFromStatus,
} from "@/domain/task-states/task-state-config";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { formatAuthorMetaParts } from "@/types/person";
import { InteractivePersonName } from "@/components/people/InteractivePersonName";
import { getTaskStatusType, type Task } from "@/types";
import type { Person } from "@/types/person";

interface StatusTimelineItemProps {
  task: Task;
  people: Person[];
}

export function StatusTimelineItem({ task, people }: StatusTimelineItemProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { peopleById } = useFeedPersonLookup();
  const { currentUser, isInteractionBlocked = false, onBlockedInteractionAttempt } = useFeedTaskViewModel();
  const getStatusToggleHint = (status?: Task["status"]): string => {
    const alternateKey = getAlternateModifierLabel();
    const statusType = getTaskStatusType(status);
    if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
    if (statusType === "done") return t("hints.statusToggle.done");
    if (statusType === "closed") return t("hints.statusToggle.closed");
    return t("hints.statusToggle.open", { alternateKey });
  };
  const {
    canCompleteTask,
    statusMenuOpen,
    statusButtonTitle,
    triggerProps,
    handleOpenChange,
    dispatchStatusChange,
    currentItemRef,
    focusTask,
  } = useTaskStatusMenu({
    task,
    currentUser,
    people,
    isInteractionBlocked,
    onBlockedInteractionAttempt,
    getStatusToggleHint,
  });
  const resolvedAuthor = peopleById.get(task.author.pubkey.toLowerCase()) ?? task.author;
  const authorMeta = useMemo(
    () => formatAuthorMetaParts({
      pubkey: resolvedAuthor.pubkey,
      displayName: resolvedAuthor.displayName,
      name: resolvedAuthor.name,
    }),
    [resolvedAuthor]
  );
  const isComment = task.taskType === "comment";
  const isTerminal = isTaskTerminalStatus(task.status);
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
  // Collapse paragraph breaks so the preview renders as one inline block —
  // `line-clamp-2` on a container with multiple <p> children produces an
  // orphan ellipsis line below the clamped text.
  const previewContent = useMemo(
    () => task.content.replace(/\s*\n\s*/g, " ").trim(),
    [task.content]
  );

  return (
    <article
      data-task-id={task.id}
      onClick={() => { if (!hasTextSelection()) focusTask(task.id); }}
      className={cn(
        "flex items-start gap-2 border-b border-border px-3 py-1.5 cursor-pointer",
        TASK_INTERACTION_STYLES.cardSurface
      )}
    >
      {isComment ? (
        <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
      ) : (
        <DropdownMenu open={statusMenuOpen} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              {...triggerProps}
              disabled={!canCompleteTask}
              aria-label={t("tasks.actions.setStatus")}
              title={statusButtonTitle}
              className={cn(
                "flex-shrink-0 mt-0.5 p-0.5 -m-0.5 rounded transition-colors",
                canCompleteTask ? "hover:bg-muted cursor-pointer" : "cursor-not-allowed opacity-60"
              )}
            >
              <TaskStateIcon status={task.status} size="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          {canCompleteTask ? (
            <DropdownMenuContent align="start">
              {getTaskStateRegistry().map((state) => {
                const isCurrent = resolveTaskStateFromStatus(task.status).id === state.id;
                return (
                  <DropdownMenuItem
                    key={state.id}
                    ref={isCurrent ? currentItemRef : undefined}
                    onClick={(event) => { event.stopPropagation(); dispatchStatusChange(state.id); }}
                    className={cn(isCurrent && "font-medium")}
                  >
                    <TaskStateDefIcon state={state} className="mr-2" />
                    <span>{state.label}</span>
                    {isCurrent && <Check className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          ) : null}
        </DropdownMenu>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <InteractivePersonName person={resolvedAuthor}>
            <span className="truncate font-medium text-foreground">{authorMeta.primary}</span>
          </InteractivePersonName>
          <span className="ml-auto shrink-0" title={task.timestamp.toLocaleString()}>{timeAgo}</span>
        </div>
        <div
          className={cn(
            "text-sm leading-snug line-clamp-2",
            isTerminal && "line-through text-muted-foreground"
          )}
        >
          {linkifyContent(previewContent, (tag) => {
            void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
          }, { plainHashtags: isTerminal, people, disableStandaloneEmbeds: true })}
        </div>
      </div>
      <TaskAssigneeAvatars task={task} className="mt-0.5" />
    </article>
  );
}
