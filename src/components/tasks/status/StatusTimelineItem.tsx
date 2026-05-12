import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { TaskStatusToggle } from "@/components/tasks/task-card/TaskStatusToggle";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedPersonLookup } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminal } from "@/domain/content/task-state";
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
  const { focusTask } = useTaskViewServices();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { peopleById } = useFeedPersonLookup();
  const { currentUser } = useFeedTaskViewModel();
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
  const isTerminal = isTaskTerminal(task.state);
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
        <TaskStatusToggle
          task={task}
          currentUser={currentUser}
          people={people}
          buttonClassName="flex-shrink-0 mt-0.5 p-0.5 -m-0.5"
          iconSize="w-3.5 h-3.5"
        />
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
