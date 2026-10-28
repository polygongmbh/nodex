import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { GanttSpan } from "./gantt-rows";

export interface WeekSpanEntry<T> {
  item: T;
  /** Inclusive local-day span (see {@link GanttSpan}). */
  span: GanttSpan;
}

/** One week row's slice of a multi-day entry, as a horizontal bar. */
export interface WeekSpanSegment<T> {
  item: T;
  /** First covered column in the week, 0-based. */
  startCol: number;
  /** Last covered column in the week, inclusive. */
  endCol: number;
  /** Stacking row within the week; lane 0 sits on top. */
  lane: number;
  /** The entry started in an earlier week. */
  continuesBefore: boolean;
  /** The entry runs on into a later week. */
  continuesAfter: boolean;
}

export function isMultiDaySpan(span: GanttSpan): boolean {
  return differenceInCalendarDays(span.end, span.start) > 0;
}

/**
 * Clips the entries to the week starting at `weekStart` and packs them into
 * lanes, calendar-app style: earlier starts first, longer bars before shorter
 * ones on the same start, each bar in the topmost lane free across its columns.
 * Entries outside the week are dropped; input order breaks remaining ties.
 */
export function layoutWeekSpans<T>(
  entries: WeekSpanEntry<T>[],
  weekStart: Date,
  daysInWeek = 7
): WeekSpanSegment<T>[] {
  const first = startOfDay(weekStart);
  const last = addDays(first, daysInWeek - 1);
  const visible = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.span.start <= last && entry.span.end >= first)
    .sort(
      (a, b) =>
        a.entry.span.start.getTime() - b.entry.span.start.getTime() ||
        b.entry.span.end.getTime() - a.entry.span.end.getTime() ||
        a.index - b.index
    );

  const laneEnds: number[] = [];
  return visible.map(({ entry }) => {
    const startCol = Math.max(0, differenceInCalendarDays(entry.span.start, first));
    const endCol = Math.min(daysInWeek - 1, differenceInCalendarDays(entry.span.end, first));
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endCol;
    return {
      item: entry.item,
      startCol,
      endCol,
      lane,
      continuesBefore: entry.span.start < first,
      continuesAfter: entry.span.end > last,
    };
  });
}

export function countWeekSpanLanes(segments: WeekSpanSegment<unknown>[]): number {
  return segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
}
