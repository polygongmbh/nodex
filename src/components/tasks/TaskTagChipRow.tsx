import { Task, Person } from "@/types";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface TaskTagChipRowProps {
  task: Task;
  people?: Person[];
  priority?: number;
  expanded?: boolean;
  maxVisibleTags?: number;
  showAllTags?: boolean;
  className?: string;
  tagClassName?: string;
  onToggleExpanded?: (expanded: boolean) => void;
  stopPropagation?: boolean;
  showEmptyPlaceholder?: boolean;
  testId?: string;
}

export function TaskTagChipRow({
  task,
  people: peopleProp,
  priority,
  expanded = false,
  maxVisibleTags = 3,
  showAllTags = false,
  className,
  tagClassName,
  onToggleExpanded,
  stopPropagation = true,
  showEmptyPlaceholder = true,
  testId,
}: TaskTagChipRowProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const hasPriority = typeof priority === "number";
  const hasMentions = hasTaskMentionChips(task);
  const hasTags = task.tags.length > 0;
  const showAll = showAllTags || expanded;
  const visibleTags = showAll ? task.tags : task.tags.slice(0, maxVisibleTags);
  const hiddenTagCount = Math.max(0, task.tags.length - visibleTags.length);

  return (
    <div className={cn("flex flex-wrap gap-1", className)} data-testid={testId}>
      {hasPriority && (
        <span className="inline-flex items-center rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
          P{priority}
        </span>
      )}
      <TaskMentionChips
        task={task}
        people={peopleProp}
        onPersonClick={(author) => {
          void dispatchFeedInteraction({ type: "filter.applyAuthorExclusive", author });
        }}
        inline
      />
      {visibleTags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
          }}
          className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium",
            TASK_INTERACTION_STYLES.hashtagChip,
            tagClassName
          )}
          aria-label={t("tasks.actions.filterTag", { tag })}
          title={t("tasks.actions.filterTag", { tag })}
        >
          #{tag}
        </button>
      ))}
      {!showAll && hiddenTagCount > 0 && (
        <button
          type="button"
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            onToggleExpanded?.(true);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label={t("tasks.tagsShowMoreAria", { count: hiddenTagCount })}
          title={t("tasks.tagsShowAll")}
        >
          +{hiddenTagCount}
        </button>
      )}
      {!showAllTags && showAll && task.tags.length > maxVisibleTags && (
        <button
          type="button"
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            onToggleExpanded?.(false);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label={t("tasks.tagsShowLess")}
          title={t("tasks.tagsShowLess")}
        >
          {t("tasks.less")}
        </button>
      )}
      {showEmptyPlaceholder && !hasPriority && !hasMentions && !hasTags && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}
