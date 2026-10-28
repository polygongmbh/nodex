import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { TaskDateShiftMode } from "@/domain/content/task-date-shift";

/** Pixels the pointer must travel before a press counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;

export interface GanttDragPreview {
  mode: TaskDateShiftMode;
  deltaDays: number;
}

/**
 * Mouse-driven move/resize of a Gantt bar in whole days. Tracks the pointer on
 * `window` so the drag survives leaving the bar, and swallows the click that
 * follows a real drag so it doesn't also focus the task.
 */
export function useGanttBarDrag(dayWidth: number, onCommit: (mode: TaskDateShiftMode, deltaDays: number) => void) {
  const [preview, setPreview] = useState<GanttDragPreview | null>(null);
  const suppressClickRef = useRef(false);

  const startDrag = useCallback(
    (mode: TaskDateShiftMode) => (event: ReactMouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const originX = event.clientX;
      let dragged = false;
      const toDelta = (clientX: number) => Math.round((clientX - originX) / dayWidth);

      const handleMove = (move: MouseEvent) => {
        if (!dragged && Math.abs(move.clientX - originX) < DRAG_THRESHOLD_PX) return;
        dragged = true;
        setPreview({ mode, deltaDays: toDelta(move.clientX) });
      };
      const handleUp = (up: MouseEvent) => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        setPreview(null);
        if (!dragged) return;
        suppressClickRef.current = true;
        const deltaDays = toDelta(up.clientX);
        if (deltaDays !== 0) onCommit(mode, deltaDays);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [dayWidth, onCommit]
  );

  /** True once for the click event fired right after a drag. */
  const consumeSuppressedClick = useCallback(() => {
    const suppressed = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppressed;
  }, []);

  return { preview, startDrag, consumeSuppressedClick };
}
