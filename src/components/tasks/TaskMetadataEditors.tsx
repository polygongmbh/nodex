import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { TaskDateType } from "@/types";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { TaskDateTypeSelect } from "./TaskDateTypeSelect";
import { TaskTimeInput } from "./TaskTimeInput";
import {
  DISPLAY_PRIORITY_OPTIONS,
  displayPriorityFromStored,
  formatPriorityLabel,
  storedPriorityFromDisplay,
} from "@/domain/content/task-priority";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TaskDueDateEditorFormProps {
  taskId: string;
  dueDate?: Date;
  dueTime?: string;
  dateType?: TaskDateType;
  idPrefix?: string;
  onClose?: () => void;
}

export function TaskDueDateEditorForm({
  taskId,
  dueDate,
  dueTime,
  dateType,
  idPrefix = "task",
  onClose,
}: TaskDueDateEditorFormProps) {
  const { t } = useTranslation("tasks");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [localDueDate, setLocalDueDate] = useState<Date | undefined>(dueDate);
  const [localDueTime, setLocalDueTime] = useState(dueTime || "");
  const [localDateType, setLocalDateType] = useState<TaskDateType>(dateType || "due");

  useEffect(() => {
    setLocalDueDate(dueDate);
  }, [dueDate, taskId]);

  useEffect(() => {
    setLocalDueTime(dueTime || "");
  }, [dueTime, taskId]);

  useEffect(() => {
    setLocalDateType(dateType || "due");
  }, [dateType, taskId]);

  const handleConfirm = () => {
    void dispatchFeedInteraction({
      type: "task.updateDueDate",
      taskId,
      dueDate: localDueDate,
      dueTime: localDueTime || undefined,
      dateType: localDateType,
    });
    onClose?.();
  };

  const handleClear = () => {
    setLocalDueDate(undefined);
    setLocalDueTime("");
    void dispatchFeedInteraction({
      type: "task.updateDueDate",
      taskId,
      dueDate: undefined,
      dueTime: undefined,
      dateType: localDateType,
    });
  };

  return (
    <div
      className="space-y-3 p-3"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-date-type-${taskId}`}>
          {t("listView.dates.type")}
        </label>
        <TaskDateTypeSelect
          id={`${idPrefix}-date-type-${taskId}`}
          aria-label={t("listView.dates.type")}
          value={localDateType}
          onChange={setLocalDateType}
          className="h-7 border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:ring-0"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="h-7 px-2 text-xs">
            Clear
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} className="h-7 px-3 text-xs">
            Confirm
          </Button>
        </div>
      </div>
      <CalendarComponent
        mode="single"
        selected={localDueDate}
        defaultMonth={localDueDate}
        onSelect={setLocalDueDate}
        initialFocus
        autoFocus
        showOutsideDays
        fixedWeeks
        className="p-0 pointer-events-auto [&_tbody_tr:nth-child(n+6)]:hidden"
      />
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <TaskTimeInput
          aria-label="Hours"
          value={localDueTime}
          onChange={setLocalDueTime}
          disabled={!localDueDate}
        />
      </div>
    </div>
  );
}

const PRIORITY_NONE_VALUE = "__none__";

interface PrioritySelectProps {
  id?: string;
  priority?: number;
  onPriorityChange: (priority?: number) => void;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: React.ComponentPropsWithoutRef<typeof SelectContent>["onCloseAutoFocus"];
  leadingIcon?: React.ReactNode;
  /**
   * When true, the trigger renders the short label (e.g. "P3") and surfaces the
   * full named priority via the title tooltip. Defaults to false (full named label).
   */
  compactLabel?: boolean;
  "aria-label"?: string;
  title?: string;
}

export function PrioritySelect({
  id,
  priority,
  onPriorityChange,
  className,
  contentClassName,
  disabled = false,
  stopPropagation = false,
  onOpenChange,
  onCloseAutoFocus,
  leadingIcon,
  compactLabel = false,
  title,
  ...rest
}: PrioritySelectProps) {
  const { t } = useTranslation(["app", "composer"]);
  const ariaLabel = rest["aria-label"] ?? t("composer:composer.labels.priority");
  const value = typeof priority === "number" ? String(priority) : PRIORITY_NONE_VALUE;
  const placeholder = t("composer:composer.labels.priority");
  const namedLabel =
    typeof priority === "number" ? t(`priorityLevels.${priority}`, { ns: "app" }) : "";
  const displayLabel = compactLabel
    ? typeof priority === "number"
      ? formatPriorityLabel(storedPriorityFromDisplay(priority))
      : placeholder
    : typeof priority === "number"
      ? namedLabel
      : placeholder;
  // When compact, surface the full named priority via the tooltip so hover reveals it.
  const effectiveTitle = title ?? (compactLabel && namedLabel ? namedLabel : undefined);

  const stopProps = stopPropagation
    ? {
        onClick: (event: React.MouseEvent) => event.stopPropagation(),
        onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
        onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
        onTouchStart: (event: React.TouchEvent) => event.stopPropagation(),
        onKeyDown: (event: React.KeyboardEvent) => event.stopPropagation(),
      }
    : {};

  if (disabled) {
    return (
      <button
        id={id}
        type="button"
        disabled
        aria-label={ariaLabel}
        title={effectiveTitle}
        className={cn(
          "h-8 w-auto min-w-0 max-w-full flex items-center justify-start gap-1 overflow-hidden text-xs cursor-default",
          className
        )}
        {...stopProps}
      >
        {leadingIcon}
        <span className="block min-w-0 max-w-full truncate">{displayLabel}</span>
      </button>
    );
  }

  return (
    <Select
      value={value}
      onOpenChange={onOpenChange}
      onValueChange={(next) => {
        if (next === PRIORITY_NONE_VALUE) {
          onPriorityChange(undefined);
          return;
        }
        const parsed = Number.parseInt(next, 10);
        onPriorityChange(Number.isFinite(parsed) ? parsed : undefined);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        title={effectiveTitle}
        hideIndicator
        className={cn(
          "h-8 w-auto min-w-0 max-w-full justify-start gap-1 overflow-hidden text-xs [&>span]:block [&>span]:min-w-0 [&>span]:max-w-full [&>span]:truncate",
          className
        )}
        {...stopProps}
      >
        {leadingIcon}
        <SelectValue placeholder={placeholder}>
          {displayLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className={cn("pointer-events-auto", contentClassName)}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (stopPropagation) event.preventDefault();
        }}
      >
        <SelectItem value={PRIORITY_NONE_VALUE}>{placeholder}</SelectItem>
        {DISPLAY_PRIORITY_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {t(`priorityLevels.${option}`, { ns: "app" })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TaskPrioritySelectProps {
  id?: string;
  taskId?: string;
  priority?: number;
  className?: string;
  stopPropagation?: boolean;
  /**
   * Defaults to true: card/chip surfaces show the short "PX" label and reveal
   * the named priority via the title tooltip. Set to false in dense editors
   * (e.g. table rows, composers) where the named label should remain visible.
   */
  compactLabel?: boolean;
  "aria-label"?: string;
  title?: string;
}

export function TaskPrioritySelect({
  id,
  taskId,
  priority,
  className,
  stopPropagation = false,
  compactLabel = true,
  ...rest
}: TaskPrioritySelectProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  return (
    <PrioritySelect
      id={id}
      priority={displayPriorityFromStored(priority)}
      onPriorityChange={(next) => {
        if (!taskId) return;
        const storedPriority = storedPriorityFromDisplay(next);
        if (typeof storedPriority === "number") {
          void dispatchFeedInteraction({ type: "task.updatePriority", taskId, priority: storedPriority });
        }
      }}
      className={cn(
        "h-auto justify-start rounded border-0 bg-warning/15 p-1 font-medium leading-none text-warning ring-offset-0 focus:ring-1 focus:ring-offset-0",
        className,
      )}
      disabled={!taskId}
      stopPropagation={stopPropagation}
      compactLabel={compactLabel}
      aria-label={rest["aria-label"]}
      title={rest.title}
    />
  );
}
