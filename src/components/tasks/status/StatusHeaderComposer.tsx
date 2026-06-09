import { X } from "lucide-react";
import { TaskCreateComposer } from "@/components/tasks/TaskCreateComposer";
import { useComposerSubmitHandler } from "@/components/tasks/use-composer-submit-handler";
import type { PostType, TaskDate } from "@/types";

interface StatusHeaderComposerProps {
  label: string;
  focusedTaskId: string | null;
  allowedPostTypes: readonly PostType[];
  onClose: () => void;
  defaultDates?: TaskDate[];
}

/** Inline composer dropdown opened from a StatusSectionHeader create button. */
export function StatusHeaderComposer({
  label,
  focusedTaskId,
  allowedPostTypes,
  onClose,
  defaultDates,
}: StatusHeaderComposerProps) {
  const handleSubmit = useComposerSubmitHandler({
    focusedTaskId,
    closeOnSuccess: true,
    onCancel: onClose,
  });
  return (
    <div className="p-3 border-b border-border bg-card/50 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <TaskCreateComposer
        onCancel={onClose}
        onSubmit={handleSubmit}
        compact
        focusedTaskId={focusedTaskId}
        allowedPostTypes={allowedPostTypes}
        defaultDates={defaultDates}
      />
    </div>
  );
}
