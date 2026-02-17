import { Task, Person } from "@/types";
import { TaskMentionChips, hasTaskMentionChips } from "./TaskMentionChips";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import { cn } from "@/lib/utils";

interface TaskTagChipRowProps {
  task: Task;
  people: Person[];
  expanded?: boolean;
  maxVisibleTags?: number;
  showAllTags?: boolean;
  className?: string;
  tagClassName?: string;
  onToggleExpanded?: (expanded: boolean) => void;
  onHashtagClick?: (tag: string) => void;
  onPersonClick?: (author: Person) => void;
  stopPropagation?: boolean;
}

export function TaskTagChipRow({
  task,
  people,
  expanded = false,
  maxVisibleTags = 3,
  showAllTags = false,
  className,
  tagClassName,
  onToggleExpanded,
  onHashtagClick,
  onPersonClick,
  stopPropagation = true,
}: TaskTagChipRowProps) {
  const hasMentions = hasTaskMentionChips(task);
  const hasTags = task.tags.length > 0;
  const showAll = showAllTags || expanded;
  const visibleTags = showAll ? task.tags : task.tags.slice(0, maxVisibleTags);
  const hiddenTagCount = Math.max(0, task.tags.length - visibleTags.length);

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      <TaskMentionChips task={task} people={people} onPersonClick={onPersonClick} inline />
      {visibleTags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={(event) => {
            if (stopPropagation) event.stopPropagation();
            onHashtagClick?.(tag);
          }}
          className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium",
            TASK_INTERACTION_STYLES.hashtagChip,
            tagClassName
          )}
          aria-label={`Filter to #${tag}`}
          title={`Filter to #${tag}`}
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
          aria-label={`Show ${hiddenTagCount} more tags`}
          title="Show all tags"
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
          aria-label="Show fewer tags"
          title="Show fewer tags"
        >
          less
        </button>
      )}
      {!hasMentions && !hasTags && <span className="text-xs text-muted-foreground">—</span>}
    </div>
  );
}
