import type { CSSProperties } from "react";
import type { WeekSpanSegment } from "@/domain/content/calendar-week-spans";
import type { CalendarEntryPost } from "@/features/feed-page/controllers/use-task-view-states";
import { getAuthorColor } from "@/lib/author-color";
import { cn } from "@/lib/utils";
import type { TaskPost } from "@/types";
import { getCalendarChipClass } from "./calendar-chip-style";
import { endCalendarTaskDrag, startCalendarTaskDrag } from "./calendar-task-drag";

/** Height of one bar lane including its gap, shared with the day cells' spacer. */
export const CALENDAR_SPAN_LANE_REM = 1.125;

interface CalendarWeekSpanBarsProps {
  segments: WeekSpanSegment<CalendarEntryPost>[];
  gridClassName: string;
  onSegmentClick: (segment: WeekSpanSegment<CalendarEntryPost>) => void;
  /** Days of this week row, to resolve which day of a bar was grabbed. */
  week: Date[];
  canDragTask: (task: CalendarEntryPost) => task is TaskPost;
}

/**
 * Multi-day entries of one week row as continuous bars overlaid on the day
 * cells. Flat ends mark a bar that continues into the previous/next week.
 */
export function CalendarWeekSpanBars({
  segments,
  gridClassName,
  onSegmentClick,
  week,
  canDragTask,
}: CalendarWeekSpanBarsProps) {
  if (segments.length === 0) return null;
  const gridStyle: CSSProperties = { gridAutoRows: `${CALENDAR_SPAN_LANE_REM - 0.125}rem` };
  return (
    <div
      className={cn("pointer-events-none absolute inset-x-0 top-[1.625rem] grid gap-x-px gap-y-0.5", gridClassName)}
      style={gridStyle}
    >
      {segments.map((segment) => {
        const task = segment.item;
        return (
          // A div, not a button: Firefox won't start a drag from a <button>.
          <div
            key={task.id}
            title={task.content}
            onClick={() => onSegmentClick(segment)}
            draggable={canDragTask(task)}
            onDragStart={(event) => {
              if (!canDragTask(task)) return;
              // The grabbed column, so dropping moves the bar by the distance dragged.
              const rect = event.currentTarget.getBoundingClientRect();
              const columns = segment.endCol - segment.startCol + 1;
              const offset = rect.width > 0 ? Math.floor(((event.clientX - rect.left) / rect.width) * columns) : 0;
              const col = segment.startCol + Math.min(Math.max(offset, 0), columns - 1);
              startCalendarTaskDrag(event, task, week[col]);
            }}
            onDragEnd={endCalendarTaskDrag}
            className={cn(
              "pointer-events-auto min-w-0 cursor-pointer overflow-hidden bg-background text-left",
              canDragTask(task) && "cursor-grab",
              !segment.continuesBefore && "ml-0.5 rounded-l",
              !segment.continuesAfter && "mr-0.5 rounded-r"
            )}
            style={{ gridColumn: `${segment.startCol + 2} / ${segment.endCol + 3}`, gridRow: segment.lane + 1 }}
          >
            <span
              className={cn(
                "flex h-full items-center gap-1 px-1 text-[0.625rem] leading-tight hover:brightness-95",
                getCalendarChipClass(task)
              )}
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: getAuthorColor(task.pubkey).accent }}
              />
              <span className="truncate">{task.content}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
