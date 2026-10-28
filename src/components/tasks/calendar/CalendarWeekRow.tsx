import { useMemo } from "react";
import { getISOWeek, isSameDay, isSameMonth, isToday } from "date-fns";
import {
  countWeekSpanLanes,
  layoutWeekSpans,
  type WeekSpanEntry,
  type WeekSpanSegment,
} from "@/domain/content/calendar-week-spans";
import type { CalendarEntryPost } from "@/features/feed-page/controllers/use-task-view-states";
import { useTaskReschedule } from "@/features/feed-page/controllers/use-task-reschedule";
import type { TaskPost } from "@/types";
import { cn } from "@/lib/utils";
import { CalendarDayCell } from "./CalendarDayCell";
import { CalendarWeekSpanBars } from "./CalendarWeekSpanBars";

interface CalendarWeekRowProps {
  week: Date[];
  month: Date;
  isMobile: boolean;
  gridClassName: string;
  selectedDate: Date | null;
  getTasksForDay: (day: Date) => CalendarEntryPost[];
  multiDayEntries: WeekSpanEntry<CalendarEntryPost>[];
  onSelectDay: (day: Date, inDisplayedMonth: boolean) => void;
  onSpanClick: (task: CalendarEntryPost, day: Date, inDisplayedMonth: boolean) => void;
  currentWeekRef: (node: HTMLDivElement | null) => void;
}

/**
 * One month-grid week. On desktop, multi-day entries render once as bars
 * spanning their days instead of a chip in every covered day cell; mobile
 * keeps per-day dots.
 */
export function CalendarWeekRow({
  week,
  month,
  isMobile,
  gridClassName,
  selectedDate,
  getTasksForDay,
  multiDayEntries,
  onSelectDay,
  onSpanClick,
  currentWeekRef,
}: CalendarWeekRowProps) {
  const weekContainsToday = week.some((day) => isToday(day));
  const { canReschedule, reschedule } = useTaskReschedule();
  // Drag and drop is desktop-only; mobile cells show dots, not chips.
  const canDragTask = (task: CalendarEntryPost): task is TaskPost => !isMobile && canReschedule(task);
  const moveTask = (task: TaskPost, deltaDays: number) => reschedule(task, "move", deltaDays);
  const segments = useMemo<WeekSpanSegment<CalendarEntryPost>[]>(
    () => (isMobile || week.length === 0 ? [] : layoutWeekSpans(multiDayEntries, week[0], week.length)),
    [isMobile, multiDayEntries, week]
  );
  const laneCount = countWeekSpanLanes(segments);

  return (
    <div
      ref={(node) => {
        if (weekContainsToday) currentWeekRef(node);
      }}
      data-current-week={weekContainsToday ? "true" : undefined}
      className={cn("relative grid gap-px bg-border/35", gridClassName)}
    >
      <div
        className={cn(
          "flex items-center justify-center text-xs font-medium",
          weekContainsToday ? "bg-primary/15 text-primary font-semibold" : "bg-muted/55 text-muted-foreground"
        )}
      >
        {getISOWeek(week[3] ?? week[0])}
      </div>
      {week.map((day, col) => {
        const barIds = new Set(
          segments.filter((s) => s.startCol <= col && col <= s.endCol).map((s) => s.item.id)
        );
        return (
          <CalendarDayCell
            key={day.toISOString()}
            day={day}
            month={month}
            isMobile={isMobile}
            isSelected={Boolean(selectedDate && isSameDay(day, selectedDate))}
            weekContainsToday={weekContainsToday}
            dayTasks={getTasksForDay(day).filter((task) => !barIds.has(task.id))}
            spanLaneCount={laneCount}
            onSelect={(selected) => onSelectDay(selected, isSameMonth(selected, month))}
            canDragTask={canDragTask}
            onMoveTask={moveTask}
          />
        );
      })}
      <CalendarWeekSpanBars
        segments={segments}
        gridClassName={gridClassName}
        week={week}
        canDragTask={canDragTask}
        onSegmentClick={(segment) => {
          const day = week[segment.startCol];
          onSpanClick(segment.item, day, isSameMonth(day, month));
        }}
      />
    </div>
  );
}
