import { eachDayOfInterval, format, getISOWeek, isToday, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import type { GanttSpan } from "@/domain/content/gantt-rows";

interface GanttTimelineHeaderProps {
  range: GanttSpan;
  dayWidth: number;
  labelWidth: number;
  weekLabel: string;
}

/** Two-row sticky header: months on top, days (or ISO weeks when zoomed out) below. */
export function GanttTimelineHeader({ range, dayWidth, labelWidth, weekLabel }: GanttTimelineHeaderProps) {
  const days = eachDayOfInterval(range);
  const months: { key: string; label: string; count: number }[] = [];
  for (const day of days) {
    const key = format(day, "yyyy-MM");
    const last = months[months.length - 1];
    if (last?.key === key) last.count += 1;
    else months.push({ key, label: format(day, "MMMM yyyy"), count: 1 });
  }
  const showDays = dayWidth >= 20;

  return (
    <div className="sticky top-0 z-20 flex border-b border-border bg-background">
      <div className="sticky left-0 z-30 shrink-0 border-r border-border bg-background" style={{ width: labelWidth }} />
      <div>
        <div className="flex border-b border-border">
          {months.map((month) => (
            <div
              key={month.key}
              className="truncate border-r border-border px-2 py-1 text-xs font-medium"
              style={{ width: month.count * dayWidth }}
            >
              {month.label}
            </div>
          ))}
        </div>
        <div className="flex text-[11px] text-muted-foreground">
          {days.map((day) => {
            const isWeekStart = day.getDay() === 1;
            return (
              <div
                key={day.getTime()}
                className={cn(
                  "shrink-0 overflow-visible whitespace-nowrap py-0.5",
                  showDays && "border-r border-border/50 text-center",
                  showDays && isWeekend(day) && "bg-muted/40",
                  isToday(day) && "font-semibold text-primary"
                )}
                style={{ width: dayWidth }}
              >
                {showDays ? format(day, "d") : isWeekStart ? `${weekLabel} ${getISOWeek(day)}` : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
