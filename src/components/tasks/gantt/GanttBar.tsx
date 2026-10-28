import { ganttDayOffset, type GanttSpan } from "@/domain/content/gantt-rows";
import type { TaskDateShiftMode } from "@/domain/content/task-date-shift";
import { cn } from "@/lib/utils";
import { useGanttBarDrag } from "./use-gantt-bar-drag";

interface GanttBarProps {
  span: GanttSpan;
  range: GanttSpan;
  dayWidth: number;
  className: string;
  title: string;
  /** Without it the bar is click-only (derived summaries, read-only tasks). */
  onReschedule?: (mode: TaskDateShiftMode, deltaDays: number) => void;
  onClick: () => void;
}

const noop = () => {};

export function GanttBar({ span, range, dayWidth, className, title, onReschedule, onClick }: GanttBarProps) {
  const { preview, startDrag, consumeSuppressedClick } = useGanttBarDrag(dayWidth, onReschedule ?? noop);
  const delta = preview?.deltaDays ?? 0;
  const startShift = preview && preview.mode !== "resize-end" ? delta : 0;
  const endShift = preview && preview.mode !== "resize-start" ? delta : 0;
  const startOffset = ganttDayOffset(range, span.start) + startShift;
  const endOffset = ganttDayOffset(range, span.end) + endShift;
  // A resized edge stops at the opposite edge, as planTaskDateShift clamps it.
  const left = preview?.mode === "resize-end" ? startOffset : Math.min(startOffset, endOffset);
  const right = preview?.mode === "resize-start" ? endOffset : Math.max(startOffset, endOffset);

  return (
    <div
      data-testid="gantt-bar"
      title={title}
      onClick={() => {
        if (!consumeSuppressedClick()) onClick();
      }}
      onMouseDown={onReschedule ? startDrag("move") : undefined}
      className={cn(
        "group absolute rounded-sm",
        className,
        onReschedule ? "cursor-grab" : "cursor-pointer",
        preview && "cursor-grabbing opacity-80 ring-2 ring-primary"
      )}
      style={{ left: left * dayWidth, width: (right - left + 1) * dayWidth }}
    >
      {onReschedule ? (
        <>
          <div
            data-testid="gantt-bar-start-handle"
            onMouseDown={startDrag("resize-start")}
            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-sm group-hover:bg-foreground/20"
          />
          <div
            data-testid="gantt-bar-end-handle"
            onMouseDown={startDrag("resize-end")}
            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-sm group-hover:bg-foreground/20"
          />
        </>
      ) : null}
    </div>
  );
}
