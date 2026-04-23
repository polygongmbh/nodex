import type { ReactNode } from "react";
import { Task } from "@/types";
import type { Person } from "@/types/person";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { TaskLocationChip } from "./TaskLocationChip";
import { TASK_CHIP_STYLES, TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
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

function hasTaskChipContent(
  task: Task,
  activeRelayCount: number,
  includeRelayChip: boolean,
  includeLocationChip: boolean
): boolean {
  return (
    (includeRelayChip && activeRelayCount > 1 && task.relays.length > 0) ||
    (includeLocationChip && Boolean(task.locationGeohash)) ||
    hasTaskMentionChips(task) ||
    task.tags.length > 0
  );
}

export function hasTaskMetadataChips(task: Task, activeRelayCount: number): boolean {
  return hasTaskChipContent(task, activeRelayCount, true, true);
}

export function hasTaskMentionTagChips(task: Task): boolean {
  return hasTaskMentionChips(task) || task.tags.length > 0;
}

function TaskTagChipContent({
  task,
  people: peopleProp,
  tagClassName,
  stopPropagation = true,
  showEmptyPlaceholder = true,
  includeRelayChip,
  includeLocationChip,
}: TaskTagChipInlineProps & {
  includeRelayChip: boolean;
  includeLocationChip: boolean;
}) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { relays, people: contextPeople } = useFeedSurfaceState();
  const people = peopleProp ?? contextPeople;
  const activeRelays = relays.filter((relay) => relay.isActive);
  const matchingRelays =
    includeRelayChip && activeRelays.length > 1 && task.relays.length > 0
      ? activeRelays.filter((relay) => task.relays.includes(relay.id))
      : [];
  const relayChips =
    matchingRelays.length > 0
      ? matchingRelays
      : includeRelayChip && activeRelays.length > 1 && task.relays.length > 0
        ? [{ id: task.relays[0], name: task.relays[0], url: task.relays[0] }]
        : [];

  if (!hasTaskChipContent(task, activeRelays.length, includeRelayChip, includeLocationChip)) {
    return showEmptyPlaceholder ? <span className="shrink-0 text-xs text-muted-foreground">—</span> : null;
  }

  return (
    <>
      {relayChips.length === 1 ? (
        <span className={TASK_CHIP_STYLES.muted}>
          {relayChips[0].name || relayChips[0].url}
        </span>
      ) : relayChips.length > 1 ? (
        <span className={cn(TASK_CHIP_STYLES.muted, "gap-1")} title={relayChips.map((r) => r.name || r.url).join(", ")}>
          {relayChips.map((relay) => {
            const RelayIcon = resolveRelayIcon(relay.url || relay.id);
            return <RelayIcon key={relay.id} className="w-3 h-3" aria-label={relay.name || relay.url} />;
          })}
        </span>
      ) : null}
      {includeLocationChip && task.locationGeohash ? (
        <TaskLocationChip
          geohash={task.locationGeohash}
          className={TASK_CHIP_STYLES.muted}
        />
      ) : null}
      <TaskMentionChips
        task={task}
        people={people}
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
            TASK_CHIP_STYLES.base,
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

export function TaskTagChipInline({
  task,
  people: peopleProp,
  tagClassName,
  stopPropagation = true,
  showEmptyPlaceholder = true,
}: TaskTagChipInlineProps) {
  return (
    <TaskTagChipContent
      task={task}
      people={peopleProp}
      tagClassName={tagClassName}
      stopPropagation={stopPropagation}
      showEmptyPlaceholder={showEmptyPlaceholder}
      includeRelayChip
      includeLocationChip
    />
  );
}

export function TaskMentionTagChipInline(props: TaskTagChipInlineProps) {
  return <TaskTagChipContent {...props} includeRelayChip={false} includeLocationChip={false} />;
}

type TaskTagChipRowProps = BaseTaskTagChipProps;

function TaskChipRow({
  task,
  people,
  priority,
  className,
  tagClassName,
  stopPropagation = true,
  showEmptyPlaceholder = true,
  testId,
  renderInline,
}: TaskTagChipRowProps & {
  renderInline: (props: TaskTagChipInlineProps) => ReactNode;
}) {
  const hasPriority = typeof priority === "number";

  return (
    <div className={cn("flex flex-wrap gap-1", className)} data-testid={testId}>
      {hasPriority ? (
        <span className={TASK_CHIP_STYLES.priority}>
          {formatPriorityLabel(priority)}
        </span>
      ) : null}
      {renderInline({
        task: task,
        people: people,
        tagClassName: tagClassName,
        stopPropagation: stopPropagation,
        showEmptyPlaceholder: showEmptyPlaceholder && !hasPriority
      })}
    </div>
  );
}

export function TaskTagChipRow(props: TaskTagChipRowProps) {
  return <TaskChipRow {...props} renderInline={(inlineProps) => <TaskTagChipInline {...inlineProps} />} />;
}

export function TaskMentionTagChipRow(props: TaskTagChipRowProps) {
  return <TaskChipRow {...props} renderInline={(inlineProps) => <TaskMentionTagChipInline {...inlineProps} />} />;
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
        <span className={TASK_CHIP_STYLES.priority}>
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
