import type { CSSProperties } from "react";
import type { WeekSpanSegment } from "@/domain/content/calendar-week-spans";
import type { CalendarEntryPost } from "@/features/feed-page/controllers/use-task-view-states";
import { getAuthorColor } from "@/lib/author-color";
import { cn } from "@/lib/utils";
import { getCalendarChipClass } from "./calendar-chip-style";

/** Height of one bar lane including its gap, shared with the day cells' spacer. */
export const CALENDAR_SPAN_LANE_REM = 1.125;

interface CalendarWeekSpanBarsProps {
  segments: WeekSpanSegment<CalendarEntryPost>[];
  gridClassName: string;
  onSegmentClick: (segment: WeekSpanSegment<CalendarEntryPost>) => void;
}

/**
 * Multi-day entries of one week row as continuous bars overlaid on the day
 * cells. Flat ends mark a bar that continues into the previous/next week.
 */
export function CalendarWeekSpanBars({ segments, gridClassName, onSegmentClick }: CalendarWeekSpanBarsProps) {
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
          <button
            key={task.id}
            type="button"
            title={task.content}
            onClick={() => onSegmentClick(segment)}
            className={cn(
              "pointer-events-auto min-w-0 overflow-hidden bg-background text-left",
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
          </button>
        );
      })}
    </div>
  );
}
