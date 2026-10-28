import { format } from "date-fns";
import { TaskStateIcon } from "@/components/tasks/task-state-ui";
import { ganttDayOffset, type GanttRow, type GanttSpan } from "@/domain/content/gantt-rows";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { useTaskReschedule } from "@/features/feed-page/controllers/use-task-reschedule";
import { cn } from "@/lib/utils";
import { getTaskState, getTaskStatusFromTask, type TaskStatus } from "@/types";
import { GanttBar } from "./GanttBar";

const BAR_CLASS_BY_STATUS: Record<TaskStatus, string> = {
  open: "bg-primary/70",
  active: "bg-warning",
  done: "bg-primary/30",
  closed: "bg-muted-foreground/30",
};

interface GanttTaskRowProps {
  row: GanttRow;
  range: GanttSpan;
  dayWidth: number;
  labelWidth: number;
  onFocusTask: (taskId: string) => void;
}

export function GanttTaskRow({ row, range, dayWidth, labelWidth, onFocusTask }: GanttTaskRowProps) {
  const { task, span, derived, markers } = row;
  const { canReschedule, reschedule } = useTaskReschedule();
  const label = formatBreadcrumbLabel(task.content);
  const status = getTaskStatusFromTask(task);
  const spanTitle = span
    ? `${label}\n${format(span.start, "PP")}${span.end > span.start ? ` – ${format(span.end, "PP")}` : ""}`
    : label;

  return (
    <div className="flex h-8 border-b border-border/50 hover:bg-muted/30">
      <button
        type="button"
        onClick={() => onFocusTask(task.id)}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-background pr-2 text-left text-sm"
        style={{ width: labelWidth, paddingLeft: 8 + row.depth * 16 }}
        title={label}
      >
        <TaskStateIcon status={getTaskState(task)} size="w-3.5 h-3.5" className="shrink-0" />
        <span className={cn("truncate", derived && "font-semibold", status === "done" && "line-through text-muted-foreground")}>
          {label}
        </span>
      </button>
      <div className="relative flex-1">
        {span ? (
          <GanttBar
            span={span}
            range={range}
            dayWidth={dayWidth}
            title={spanTitle}
            className={derived ? "top-3 h-2 bg-foreground/50" : cn("top-1.5 h-5", BAR_CLASS_BY_STATUS[status])}
            onReschedule={
              !derived && canReschedule(task) ? (mode, deltaDays) => reschedule(task, mode, deltaDays) : undefined
            }
            onClick={() => onFocusTask(task.id)}
          />
        ) : null}
        {markers.map((marker) => (
          <div
            key={marker.date.getTime()}
            title={`${label}\n${format(marker.date, "PP")}`}
            className="absolute top-2.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-foreground"
            style={{ left: (ganttDayOffset(range, marker.date) + 0.5) * dayWidth }}
          />
        ))}
      </div>
    </div>
  );
}
