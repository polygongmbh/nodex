import type { DragEvent } from "react";
import type { TaskPost } from "@/types";

const DRAG_MIME = "application/x-nodex-task";

interface CalendarTaskDrag {
  task: TaskPost;
  /** The day the drag was grabbed on; the drop day minus this is the shift. */
  fromDay: Date;
}

// The dragged task stays in memory: dataTransfer is unreadable during
// dragover and only carries strings. setData is still required for Firefox
// to start the drag at all.
let activeDrag: CalendarTaskDrag | null = null;

export function startCalendarTaskDrag(event: DragEvent, task: TaskPost, fromDay: Date): void {
  activeDrag = { task, fromDay };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_MIME, task.id);
}

export function endCalendarTaskDrag(): void {
  activeDrag = null;
}

/** The task being dragged when `event` carries a calendar task drag, else null. */
export function getCalendarTaskDrag(event: DragEvent): CalendarTaskDrag | null {
  return activeDrag && Array.from(event.dataTransfer.types).includes(DRAG_MIME) ? activeDrag : null;
}
