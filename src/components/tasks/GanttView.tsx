import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { featureDebugLog } from "@/lib/feature-debug";
import { ganttDayOffset, getGanttRange } from "@/domain/content/gantt-rows";
import { useGanttViewState } from "@/features/feed-page/controllers/use-gantt-view-state";
import type { Post } from "@/types";
import { GanttTaskRow } from "./gantt/GanttTaskRow";
import { GanttTimelineHeader } from "./gantt/GanttTimelineHeader";
import { useTaskViewServices } from "./use-task-view-services";

const LABEL_WIDTH = 280;
const ZOOM_DAY_WIDTH = { day: 32, week: 12, month: 4 } as const;
type GanttZoom = keyof typeof ZOOM_DAY_WIDTH;

interface GanttViewProps {
  posts: Post[];
  focusedTaskId: string | null;
}

export function GanttView({ posts, focusedTaskId }: GanttViewProps) {
  const { t } = useTranslation("tasks");
  const { focusTask } = useTaskViewServices();
  const rows = useGanttViewState({ posts, focusedTaskId });
  const [zoom, setZoom] = useState<GanttZoom>("day");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const today = useMemo(() => new Date(), []);
  const range = useMemo(() => getGanttRange(rows, today), [rows, today]);
  const dayWidth = ZOOM_DAY_WIDTH[zoom];
  const totalDays = ganttDayOffset(range, range.end) + 1;
  const todayLeft = LABEL_WIDTH + (ganttDayOffset(range, today) + 0.5) * dayWidth;

  const hasRows = rows.length > 0;
  const rangeStartTime = range.start.getTime();
  const anchorRef = useRef<{ zoom: GanttZoom; rangeStartTime: number } | null>(null);

  // why: when the timeline first appears or the zoom changes, scroll so today
  // sits near the left edge of the track; when hydration later moves the range
  // start, shift by the same days so the visible dates (and today) stay put.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const anchor = anchorRef.current;
    if (!scroller) {
      anchorRef.current = null;
      return;
    }
    if (!anchor || anchor.zoom !== zoom) {
      scroller.scrollLeft = Math.max(0, todayLeft - LABEL_WIDTH - 7 * dayWidth);
      featureDebugLog("gantt", "Anchored timeline on today", { zoom, rows: rows.length, totalDays });
    } else if (anchor.rangeStartTime !== rangeStartTime) {
      scroller.scrollLeft += differenceInCalendarDays(anchor.rangeStartTime, rangeStartTime) * dayWidth;
    }
    anchorRef.current = { zoom, rangeStartTime };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-anchor on zoom/appearance/range start only, not on every row update
  }, [zoom, hasRows, rangeStartTime]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-border px-3 py-1.5">
        {(Object.keys(ZOOM_DAY_WIDTH) as GanttZoom[]).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setZoom(level)}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              zoom === level ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t(`gantt.zoom.${level}`)}
          </button>
        ))}
      </div>
      {!hasRows ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {t("gantt.empty")}
        </div>
      ) : (
        <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto">
          <div className="relative" style={{ width: LABEL_WIDTH + totalDays * dayWidth }}>
            <GanttTimelineHeader
              range={range}
              dayWidth={dayWidth}
              labelWidth={LABEL_WIDTH}
              weekLabel={t("calendar.weekShort")}
            />
            {rows.map((row) => (
              <GanttTaskRow
                key={row.task.id}
                row={row}
                range={range}
                dayWidth={dayWidth}
                labelWidth={LABEL_WIDTH}
                onFocusTask={focusTask}
              />
            ))}
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-destructive/60"
              style={{ left: todayLeft }}
              title={t("gantt.today")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
