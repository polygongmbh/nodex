import { useState } from "react";
import { differenceInCalendarDays, format, isSameMonth, isToday } from "date-fns";
import { useTranslation } from "react-i18next";
import type { CalendarEntryPost } from "@/features/feed-page/controllers/use-task-view-states";
import { getAuthorColor } from "@/lib/author-color";
import { cn } from "@/lib/utils";
import { formatLocalIsoDate, type TaskPost } from "@/types";
import { getCalendarChipClass } from "./calendar-chip-style";
import { endCalendarTaskDrag, getCalendarTaskDrag, startCalendarTaskDrag } from "./calendar-task-drag";
import { CALENDAR_SPAN_LANE_REM } from "./CalendarWeekSpanBars";

interface CalendarDayCellProps {
  day: Date;
  month: Date;
  isMobile: boolean;
  isSelected: boolean;
  weekContainsToday: boolean;
  /** Entries listed in the cell; multi-day bars drawn over the week are excluded. */
  dayTasks: CalendarEntryPost[];
  /** Lanes of multi-day bars overlaid on this week, reserved above the chips. */
  spanLaneCount: number;
  onSelect: (day: Date) => void;
  /** Desktop drag and drop: which chips may be dragged, and the drop command. */
  canDragTask: (task: CalendarEntryPost) => task is TaskPost;
  onMoveTask: (task: TaskPost, deltaDays: number) => void;
}

export function CalendarDayCell({
  day,
  month,
  isMobile,
  isSelected,
  weekContainsToday,
  dayTasks,
  spanLaneCount,
  onSelect,
  canDragTask,
  onMoveTask,
}: CalendarDayCellProps) {
  const { t } = useTranslation("tasks");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const isInDisplayedMonth = isSameMonth(day, month);
  const dayIsToday = isToday(day);

  return (
    // A div, not a button: Firefox won't start a drag from inside a <button>.
    <div
      data-day={formatLocalIsoDate(day)}
      onClick={() => onSelect(day)}
      onDragOver={(event) => {
        if (!getCalendarTaskDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(event) => {
        setIsDropTarget(false);
        const drag = getCalendarTaskDrag(event);
        if (!drag) return;
        event.preventDefault();
        endCalendarTaskDrag();
        const deltaDays = differenceInCalendarDays(day, drag.fromDay);
        if (deltaDays !== 0) onMoveTask(drag.task, deltaDays);
      }}
      className={cn(
        "cursor-pointer",
        "transition-colors duration-150 text-left flex flex-col relative border border-transparent",
        isMobile ? "min-h-[4.4rem] p-1" : "min-h-[6.2rem] p-1",
        // Subtle row tint when this week contains today, distinct from selected day
        weekContainsToday ? "bg-primary/5" : "bg-background",
        dayIsToday && "border-primary bg-primary/15 ring-1 ring-primary/40",
        isSelected ? "bg-primary/25 border-primary" : !dayIsToday && "hover:bg-muted/40",
        !isInDisplayedMonth && "opacity-60",
        isDropTarget && "ring-2 ring-primary"
      )}
    >
      <span
        className={cn(
          isMobile ? "text-xs" : "text-sm",
          "font-medium",
          dayIsToday &&
            "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground"
        )}
      >
        {format(day, "d")}
      </span>
      {spanLaneCount > 0 && (
        <div className="flex-shrink-0" style={{ height: `${spanLaneCount * CALENDAR_SPAN_LANE_REM}rem` }} />
      )}
      {dayTasks.length > 0 &&
        (isMobile ? (
          <div className="flex gap-0.5 mt-0.5">
            {dayTasks.slice(0, 3).map((task) => (
              <span
                key={task.id}
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: getAuthorColor(task.pubkey).accent }}
              />
            ))}
            {dayTasks.length > 3 && <span className="text-[0.375rem] text-muted-foreground">+</span>}
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden w-full">
            {dayTasks.slice(0, 2).map((task) => (
              <div
                key={task.id}
                draggable={canDragTask(task)}
                onDragStart={(event) => {
                  if (canDragTask(task)) startCalendarTaskDrag(event, task, day);
                }}
                onDragEnd={endCalendarTaskDrag}
                className={cn(
                  "text-[0.625rem] leading-tight px-1 py-0.5 rounded truncate flex items-center gap-1",
                  canDragTask(task) && "cursor-grab",
                  getCalendarChipClass(task)
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: getAuthorColor(task.pubkey).accent }}
                />
                {task.content.slice(0, 15)}...
              </div>
            ))}
            {dayTasks.length > 2 && (
              <span className="text-[0.625rem] text-muted-foreground">
                {t("calendar.moreTasks", { count: dayTasks.length - 2 })}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}
