import { addDays, differenceInCalendarDays } from "date-fns";
import { getTaskLocalDate, getTaskTimeOfDay } from "@/lib/task-dates";
import type { TaskDate, TaskDateType, TaskPost } from "@/types";

export type TaskDateShiftMode = "move" | "resize-start" | "resize-end";

/** One date to (re)publish; `time` is set only for datetime entries. */
export interface TaskDateChange {
  type: TaskDateType;
  date: Date;
  time?: string;
}

type DatedEntry = { entry: TaskDate; day: Date };

function findFirst(dates: TaskDate[], types: TaskDateType[]): DatedEntry | undefined {
  for (const type of types) {
    const entry = dates.find((d) => d.type === type);
    const day = entry ? getTaskLocalDate(entry) : undefined;
    if (entry && day) return { entry, day };
  }
  return undefined;
}

function shifted({ entry, day }: DatedEntry, deltaDays: number, type: TaskDateType = entry.type): TaskDateChange {
  return { type, date: addDays(day, deltaDays), time: getTaskTimeOfDay(entry) };
}

/**
 * Date changes for dragging a task by `deltaDays`, using the same span sides
 * as the Gantt bar (`start`/`scheduled` → `end`/`due`):
 * - `move` shifts both sides, or the milestones when the task has no span.
 * - `resize-start` / `resize-end` shift one side, clamped at the other.
 *   A single-date task grows into a range: the dragged edge moves, the other
 *   edge stays on the original day (adding the missing `start`/`end`).
 * Times of day are kept.
 */
export function planTaskDateShift(task: TaskPost, mode: TaskDateShiftMode, deltaDays: number): TaskDateChange[] {
  if (deltaDays === 0) return [];
  const start = findFirst(task.dates, ["start", "scheduled"]);
  const end = findFirst(task.dates, ["end", "due"]);

  if (mode === "move") {
    if (start || end) return [start, end].flatMap((side) => (side ? [shifted(side, deltaDays)] : []));
    return task.dates.flatMap((entry) => {
      const day = entry.type === "milestone" ? getTaskLocalDate(entry) : undefined;
      return day ? [shifted({ entry, day }, deltaDays)] : [];
    });
  }

  const isStart = mode === "resize-start";
  const own = isStart ? start : end;
  const other = isStart ? end : start;

  if (own && other) {
    const room = differenceInCalendarDays(other.day, own.day);
    const delta = isStart ? Math.min(deltaDays, room) : Math.max(deltaDays, room);
    return delta === 0 ? [] : [shifted(own, delta)];
  }

  // Single date: only growing outward makes a range; shrinking a one-day bar is a no-op.
  const single = own ?? other;
  const growsOutward = isStart ? deltaDays < 0 : deltaDays > 0;
  if (!single || !growsOutward) return [];
  const ownType: TaskDateType = isStart ? "start" : "end";
  const otherType: TaskDateType = isStart ? "end" : "start";
  return own
    ? [shifted(own, deltaDays), shifted(own, 0, otherType)]
    : [shifted(single, deltaDays, ownType)];
}
