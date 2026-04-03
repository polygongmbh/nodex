import { Task } from "@/types";
import type { Person } from "@/types/person";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { TaskLocationChip } from "./TaskLocationChip";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { formatPriorityLabel } from "@/domain/content/task-priority";

interface BaseTaskTagChipProps {
  task: Task;
  people?: Person[];
  priority?: number;
  className?: string;
  tagClassName?: string;
  stopPropagation?: boolean;
  showEmptyPlaceholder?: boolean;
  testId?: string;
}

type TaskTagChipInlineProps = Omit<BaseTaskTagChipProps, "priority" | "className" | "testId">;

export function hasTaskMetadataChips(task: Task, activeRelayCount: number): boolean {
  return (
    (activeRelayCount > 1 && task.relays.length > 0) ||
    Boolean(task.locationGeohash) ||
    hasTaskMentionChips(task) ||
    task.tags.length > 0
  );
}

export function TaskTagChipInline({
  task,
  people: peopleProp,
  tagClassName,
  stopPropagation = true,
  showEmptyPlaceholder = true,
}: TaskTagChipInlineProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { relays, people: contextPeople } = useFeedSurfaceState();
  const people = peopleProp ?? contextPeople;
  const activeRelays = relays.filter((relay) => relay.isActive);
  const relayLabel =
    activeRelays.length > 1 && task.relays.length > 0
      ? activeRelays.find((relay) => task.relays.includes(relay.id))?.name || task.relays[0]
      : null;
  const hasMentions = hasTaskMentionChips(task);
  const hasTags = task.tags.length > 0;

  if (!hasTaskMetadataChips(task, activeRelays.length)) {
    return showEmptyPlaceholder ? <span className="shrink-0 text-xs text-muted-foreground">—</span> : null;
  }

  return (
    <>
      {relayLabel ? (
        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {relayLabel}
        </span>
      ) : null}
      {task.locationGeohash ? (
        <TaskLocationChip
          geohash={task.locationGeohash}
          className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground"
        />
      ) : null}
      <TaskMentionChips
        task={task}
        people={people}
        onPersonClick={(author) => {
          void dispatchFeedInteraction({ type: "filter.applyAuthorExclusive", author });
        }}
        inline
      />
      {task.tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
          }}
          className={cn(
            "shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-xs font-medium",
            TASK_INTERACTION_STYLES.hashtagChip,
            tagClassName
          )}
          aria-label={t("tasks.actions.filterTag", { tag })}
          title={t("tasks.actions.filterTag", { tag })}
        >
          #{tag}
        </button>
      ))}
    </>
  );
}

type TaskTagChipRowProps = BaseTaskTagChipProps;

export function TaskTagChipRow({
  task,
  people,
  priority,
  className,
  tagClassName,
  stopPropagation = true,
  showEmptyPlaceholder = true,
  testId,
}: TaskTagChipRowProps) {
  const hasPriority = typeof priority === "number";

  return (
    <div className={cn("flex flex-wrap gap-1", className)} data-testid={testId}>
      {hasPriority ? (
        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
          {formatPriorityLabel(priority)}
        </span>
      ) : null}
      <TaskTagChipInline
        task={task}
        people={people}
        tagClassName={tagClassName}
        stopPropagation={stopPropagation}
        showEmptyPlaceholder={showEmptyPlaceholder && !hasPriority}
      />
    </div>
  );
}

export function ScrollableTaskTagChipRow({
  task,
  people,
  priority,
  className,
  tagClassName,
  stopPropagation = true,
  showEmptyPlaceholder = true,
  testId,
}: TaskTagChipRowProps) {
  const hasPriority = typeof priority === "number";

  return (
    <div
      className={cn("flex overflow-x-auto overflow-y-hidden whitespace-nowrap gap-1 pb-1", className)}
      data-testid={testId}
    >
      {hasPriority ? (
        <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
          {formatPriorityLabel(priority)}
        </span>
      ) : null}
      <TaskTagChipInline
        task={task}
        people={people}
        tagClassName={tagClassName}
        stopPropagation={stopPropagation}
        showEmptyPlaceholder={showEmptyPlaceholder && !hasPriority}
      />
    </div>
  );
}
