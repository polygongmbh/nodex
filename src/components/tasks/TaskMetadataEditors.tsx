import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TaskDateType } from "@/types";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  DISPLAY_PRIORITY_OPTIONS,
  displayPriorityFromStored,
  formatPriorityLabel,
  storedPriorityFromDisplay,
} from "@/domain/content/task-priority";

const TASK_DATE_TYPE_OPTION_KEYS: Array<{ value: TaskDateType; labelKey: string }> = [
  { value: "due", labelKey: "composer.dates.due" },
  { value: "scheduled", labelKey: "composer.dates.scheduled" },
  { value: "start", labelKey: "composer.dates.start" },
  { value: "end", labelKey: "composer.dates.end" },
  { value: "milestone", labelKey: "composer.dates.milestone" },
];

interface TaskDueDateEditorFormProps {
  taskId: string;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  idPrefix?: string;
}

export function TaskDueDateEditorForm({
  taskId,
  dueDate,
  dueTime,
  dateType,
  idPrefix = "task",
}: TaskDueDateEditorFormProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [localDueTime, setLocalDueTime] = useState(dueTime || "");
  const [localDateType, setLocalDateType] = useState<TaskDateType>(dateType || "due");
  const dispatchDueDateUpdate = (
    nextDueDate: Date | undefined,
    nextDueTime: string | undefined,
    nextDateType: TaskDateType
  ) => {
    void dispatchFeedInteraction({
      type: "task.updateDueDate",
      taskId,
      dueDate: nextDueDate,
      dueTime: nextDueTime,
      dateType: nextDateType,
    });
  };

  useEffect(() => {
    setLocalDueTime(dueTime || "");
  }, [dueTime, taskId]);

  useEffect(() => {
    setLocalDateType(dateType || "due");
  }, [dateType, taskId]);

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-date-type-${taskId}`}>
          {t("listView.dates.type")}
        </label>
        <select
          id={`${idPrefix}-date-type-${taskId}`}
          aria-label={t("listView.dates.type")}
          value={localDateType}
          onChange={(event) => {
            const nextType = event.target.value as TaskDateType;
            setLocalDateType(nextType);
            if (dueDate) {
              dispatchDueDateUpdate(dueDate, localDueTime || undefined, nextType);
            }
          }}
          className="h-7 rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none"
        >
          {TASK_DATE_TYPE_OPTION_KEYS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <CalendarComponent
        mode="single"
        selected={dueDate}
        onSelect={(date) => {
          dispatchDueDateUpdate(date, localDueTime || undefined, localDateType);
        }}
        initialFocus
      />
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="time"
          value={localDueTime}
          onChange={(event) => {
            const value = event.target.value;
            setLocalDueTime(value);
            if (dueDate) {
              dispatchDueDateUpdate(dueDate, value || undefined, localDateType);
            }
          }}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}

interface TaskPrioritySelectProps {
  taskId: string;
  priority?: number;
  className?: string;
  disabled?: boolean;
  includeEmptyOption?: boolean;
  id?: string;
  ariaLabel?: string;
  stopPropagation?: boolean;
}

export function TaskPrioritySelect({
  taskId,
  priority,
  className,
  disabled = false,
  includeEmptyOption = false,
  id,
  ariaLabel,
  stopPropagation = false,
}: TaskPrioritySelectProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const value = (() => {
    const displayPriority = displayPriorityFromStored(priority);
    return typeof displayPriority === "number" ? String(displayPriority) : "";
  })();
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return;
        const parsed = Number.parseInt(next, 10);
        const storedPriority = storedPriorityFromDisplay(parsed);
        if (typeof storedPriority === "number") {
          void dispatchFeedInteraction({ type: "task.updatePriority", taskId, priority: storedPriority });
        }
      }}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
      className={className}
    >
      {includeEmptyOption && <option value="">—</option>}
      {DISPLAY_PRIORITY_OPTIONS.map((option) => (
        <option key={option} value={String(option)}>
          {formatPriorityLabel(storedPriorityFromDisplay(option))}
        </option>
      ))}
    </select>
  );
}
