import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Calendar as CalendarIcon, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { TaskStatusToggle } from "@/components/tasks/task-card/TaskStatusToggle";
import { AttachmentCountIndicator } from "@/components/tasks/task-card/AttachmentCountIndicator";
import { getPostAttachmentsWithoutInlineEmbeds } from "@/lib/use-task-media-attachments";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { hasTextSelection } from "@/lib/click-intent";
import { isTaskTerminal } from "@/domain/content/task-state";
import { isCommentPost, isCalendarEventPost } from "@/types";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { InteractivePersonName } from "@/components/people/InteractivePersonName";
import type { Post } from "@/types";
import { getTaskState } from "@/types";
import type { Person } from "@/types/person";

interface StatusTimelineItemProps {
  task: Post;
  people: Person[];
}

export function StatusTimelineItem({ task, people }: StatusTimelineItemProps) {
  const { t } = useTranslation("tasks");
  const { focusTask } = useTaskViewServices();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const currentUser = useCurrentUser();
  const isComment = isCommentPost(task);
  const isEvent = isCalendarEventPost(task);
  const isTerminal = isTaskTerminal(getTaskState(task));
  const timeAgo = formatDistanceToNow(task.timestamp, { addSuffix: true });
  // Collapse paragraph breaks so the preview renders as one inline block —
  // `line-clamp-2` on a container with multiple <p> children produces an
  // orphan ellipsis line below the clamped text.
  const previewContent = useMemo(
    () => task.content.replace(/\s*\n\s*/g, " ").trim(),
    [task.content]
  );
  const attachmentCount = getPostAttachmentsWithoutInlineEmbeds(task).length;

  return (
    <article
      data-task-id={task.id}
      onClick={() => { if (!hasTextSelection()) focusTask(task.id); }}
      className={cn(
        "flex items-start gap-2 border-b border-border px-3 py-1.5 cursor-pointer",
        TASK_INTERACTION_STYLES.cardSurface
      )}
    >
      {isEvent ? (
        <CalendarIcon
          className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground"
        />
      ) : isComment ? (
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
          <InteractivePersonName pubkey={task.pubkey} />
          <AttachmentCountIndicator count={attachmentCount} />
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
