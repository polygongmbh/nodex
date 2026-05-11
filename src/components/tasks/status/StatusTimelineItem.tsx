import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { TaskStateIcon } from "@/components/tasks/task-state-ui";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedPersonLookup } from "@/features/feed-page/views/feed-surface-context";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { formatAuthorMetaParts } from "@/types/person";
import { InteractivePersonName } from "@/components/people/InteractivePersonName";
import type { Task } from "@/types";
import type { Person } from "@/types/person";

interface StatusTimelineItemProps {
  task: Task;
  people: Person[];
}

export function StatusTimelineItem({ task, people }: StatusTimelineItemProps) {
  const { t } = useTranslation("tasks");
  const { focusTask } = useTaskViewServices();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { peopleById } = useFeedPersonLookup();
  const resolvedAuthor = peopleById.get(task.author.pubkey.toLowerCase()) ?? task.author;
  const authorMeta = useMemo(
    () => formatAuthorMetaParts({
      pubkey: resolvedAuthor.pubkey,
      displayName: resolvedAuthor.displayName,
      name: resolvedAuthor.name,
    }),
    [resolvedAuthor]
  );
  const isTerminal = isTaskTerminalStatus(task.status);
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });

  return (
    <article
      data-task-id={task.id}
      onClick={() => { if (!hasTextSelection()) focusTask(task.id); }}
      className={cn(
        "border-b border-border px-3 py-2 cursor-pointer",
        TASK_INTERACTION_STYLES.cardSurface
      )}
    >
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <TaskStateIcon status={task.status} size="w-3.5 h-3.5" className="flex-shrink-0" />
        <InteractivePersonName person={resolvedAuthor}>
          <span className="text-foreground font-medium truncate">{authorMeta.primary}</span>
        </InteractivePersonName>
        <span className="shrink-0">·</span>
        <span className="ml-auto shrink-0" title={task.timestamp.toLocaleString()}>{timeAgo}</span>
      </header>
      <div
        className={cn(
          "mt-1 text-sm leading-snug whitespace-pre-line line-clamp-3",
          isTerminal && "line-through text-muted-foreground"
        )}
      >
        {linkifyContent(task.content, (tag) => {
          void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
        }, { plainHashtags: isTerminal, people, disableStandaloneEmbeds: true })}
      </div>
      <footer className="mt-1 flex items-center justify-end">
        <TaskAssigneeAvatars task={task} />
      </footer>
    </article>
  );
}
