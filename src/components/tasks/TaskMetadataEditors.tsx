import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TaskDateType } from "@/types";

const TASK_DATE_TYPE_OPTION_KEYS: Array<{ value: TaskDateType; labelKey: string }> = [
  { value: "due", labelKey: "composer.dates.due" },
  { value: "scheduled", labelKey: "composer.dates.scheduled" },
  { value: "start", labelKey: "composer.dates.start" },
  { value: "end", labelKey: "composer.dates.end" },
  { value: "milestone", labelKey: "composer.dates.milestone" },
];

const TASK_PRIORITY_OPTIONS = [20, 40, 60, 80, 100] as const;

interface TaskDueDateEditorFormProps {
  taskId: string;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  idPrefix?: string;
  onUpdateDueDate?: (taskId: string, dueDate: Date | undefined, dueTime?: string, dateType?: TaskDateType) => void;
}

export function TaskDueDateEditorForm({
  taskId,
  dueDate,
  dueTime,
  dateType,
  idPrefix = "task",
  onUpdateDueDate,
}: TaskDueDateEditorFormProps) {
  const { t } = useTranslation();
  const [localDueTime, setLocalDueTime] = useState(dueTime || "");
  const [localDateType, setLocalDateType] = useState<TaskDateType>(dateType || "due");

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
              onUpdateDueDate?.(taskId, dueDate, localDueTime || undefined, nextType);
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
          onUpdateDueDate?.(taskId, date, localDueTime || undefined, localDateType);
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
              onUpdateDueDate?.(taskId, dueDate, value || undefined, localDateType);
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
  onUpdatePriority?: (taskId: string, priority: number) => void;
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
  onUpdatePriority,
}: TaskPrioritySelectProps) {
  const value = typeof priority === "number" ? String(priority) : "";
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
        if (Number.isFinite(parsed)) {
          onUpdatePriority?.(taskId, parsed);
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
      {TASK_PRIORITY_OPTIONS.map((option) => (
        <option key={option} value={String(option)}>
          P{option}
        </option>
      ))}
    </select>
  );
}
