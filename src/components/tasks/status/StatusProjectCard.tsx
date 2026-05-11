import { Calendar, Clock, Layers } from "lucide-react";
import { format } from "date-fns";
import { ScrollableTaskTagChipRow, hasTaskMetadataChips } from "@/components/tasks/TaskTagChipRow";
import { TaskAssigneeAvatars } from "@/components/tasks/TaskAssigneeAvatars";
import { TaskSurface } from "@/components/tasks/task-card/TaskSurface";
import { useTaskViewServices } from "@/components/tasks/use-task-view-services";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { getDueDateColorClass } from "@/domain/content/task-sorting";
import { cn } from "@/lib/utils";
import { linkifyContent } from "@/lib/linkify";
import { hasTextSelection } from "@/lib/click-intent";
import { getTaskDateTypeLabel } from "@/lib/task-dates";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import type { Task } from "@/types";
import type { Person } from "@/types/person";

interface StatusProjectCardProps {
  task: Task;
  people: Person[];
  isProject: boolean;
  subtaskCount: number;
}

/**
 * "Big" project card shown on the status view. Adapted from the kanban task
 * card with the status pill removed and emphasis on title, hashtags,
 * assignees and dates. Project cards (with non-terminal subtasks) are bolded
 * and click focuses; non-project cards click through to the feed/timeline view
 * — mirrors the kanban card's project-vs-leaf affordance.
 */
export function StatusProjectCard({ task, people, isProject, subtaskCount }: StatusProjectCardProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { focusTask } = useTaskViewServices();
  const { relays } = useFeedSurfaceState();
  const activeRelayCount = relays.filter((relay) => relay.isActive).length;
  const dueDateColor = getDueDateColorClass(task.dueDate, task.status);
  const showChipRow = hasTaskMetadataChips(task, activeRelayCount);

  return (
    <TaskSurface
      taskId={task.id}
      onClick={() => {
        if (hasTextSelection()) return;
        focusTask(task.id, isProject ? undefined : "feed");
      }}
      className={cn(
        "relative flex h-full min-w-[16rem] max-w-[22rem] flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm cursor-pointer",
        TASK_INTERACTION_STYLES.cardSurface
      )}
    >
      <div className={cn("text-base leading-snug truncate", isProject ? "font-semibold" : "font-normal")}>
        {linkifyContent(task.content.split("\n", 1)[0] ?? "", (tag) => {
          void dispatchFeedInteraction({ type: "filter.applyHashtagInclude", tag });
        }, { people, disableStandaloneEmbeds: true })}
      </div>
      {task.dueDate ? (
        <div className={cn("flex items-center gap-1.5 text-xs", dueDateColor)}>
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
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Layers className="w-3 h-3" />
          {subtaskCount}
        </span>
        {showChipRow ? (
          <ScrollableTaskTagChipRow
            task={task}
            className="min-w-0 flex-1"
            showEmptyPlaceholder={false}
            testId={`status-project-chips-${task.id}`}
          />
        ) : null}
        <TaskAssigneeAvatars task={task} />
      </div>
    </TaskSurface>
  );
}
