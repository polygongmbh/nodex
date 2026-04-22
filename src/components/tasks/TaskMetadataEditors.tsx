import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TaskDateType } from "@/types";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  DISPLAY_PRIORITY_OPTIONS,
  displayPriorityFromStored,
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
  const { t } = useTranslation("tasks");
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

type PrioritySelectBaseProps = Omit<
  ComponentPropsWithoutRef<"select">,
  "children" | "defaultValue" | "onChange" | "value"
>;

interface TaskPrioritySelectProps extends PrioritySelectBaseProps {
  taskId?: string;
  priority?: number;
  stopPropagation?: boolean;
}

function PrioritySelectOptions() {
  const { t } = useTranslation(["app", "composer"]);

  return (
    <>
      <option value="">{t("composer:composer.labels.priority")}</option>
      {DISPLAY_PRIORITY_OPTIONS.map((option) => (
        <option key={option} value={String(option)}>
          {t(`priorityLevels.${option}`, { ns: "app" })}
        </option>
      ))}
    </>
  );
}

interface PrioritySelectProps extends PrioritySelectBaseProps {
  priority?: number;
  onPriorityChange: (priority?: number) => void;
  stopPropagation?: boolean;
}

export function PrioritySelect({
  priority,
  onPriorityChange,
  className,
  disabled = false,
  stopPropagation = false,
  ...selectProps
}: PrioritySelectProps) {
  const { t } = useTranslation("composer");
  const value = typeof priority === "number" ? String(priority) : "";

  return (
    <select
      aria-label={t("composer.labels.priority")}
      value={value}
      disabled={disabled}
      {...selectProps}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) {
          onPriorityChange(undefined);
          return;
        }

        const parsed = Number.parseInt(next, 10);
        onPriorityChange(Number.isFinite(parsed) ? parsed : undefined);
      }}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
      className={className}
    >
      <PrioritySelectOptions />
    </select>
  );
}

export function TaskPrioritySelect({
  taskId,
  priority,
  className,
  stopPropagation = false,
  ...selectProps
}: TaskPrioritySelectProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  return (
    <PrioritySelect
      priority={displayPriorityFromStored(priority)}
      onPriorityChange={(next) => {
        if (!taskId) return;
        const storedPriority = storedPriorityFromDisplay(next);
        if (typeof storedPriority === "number") {
          void dispatchFeedInteraction({ type: "task.updatePriority", taskId, priority: storedPriority });
        }
      }}
      className={className}
      disabled={!taskId}
      stopPropagation={stopPropagation}
      {...selectProps}
    />
  );
}
