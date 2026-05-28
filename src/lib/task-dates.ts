import { getTaskPrimaryDate, isCalendarEventPost, isDateTimeTaskDate, parseIsoDateLocal } from "@/types";
import type { Post, TaskDate, TaskDateType } from "@/types";
import i18n from "@/lib/i18n/config";

export const TASK_DATE_TYPES: TaskDateType[] = ["due", "scheduled", "start", "end", "milestone"];

export function getTaskDateTypeLabel(dateType: TaskDateType | undefined): string {
  const safeDateType = dateType && TASK_DATE_TYPES.includes(dateType) ? dateType : "due";
  return i18n.t(`tasks:tasks.dates.${safeDateType}`);
}

/**
 * Project a {@link TaskDate} onto a JS `Date` for the viewer's local timezone
 * — suitable for `date-fns format()`, sorting, and `startOfDay` arithmetic.
 *
 * - For the **datetime** variant: the moment as stored (an actual instant).
 * - For the **calendar-date** variant: local-midnight on the day (parsed from
 *   the `YYYY-MM-DD` string). Not a moment in any meaningful sense — just the
 *   Date that `format()` will render as the day the user picked.
 */
export function getTaskLocalDate(entry: TaskDate): Date | undefined {
  if (isDateTimeTaskDate(entry)) return entry.datetime;
  return parseIsoDateLocal(entry.date);
}

/**
 * Return the `HH:mm` time-of-day for the **datetime** variant, or `undefined`
 * for calendar-date entries (which carry no time). The string is in the
 * viewer's local timezone (matching the wire-parse symmetry).
 */
export function getTaskTimeOfDay(entry: TaskDate): string | undefined {
  if (!isDateTimeTaskDate(entry)) return undefined;
  const d = entry.datetime;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function isTaskLockedUntilStart(task: Post, now: Date = new Date()): boolean {
  if (isCalendarEventPost(task)) return false;
  const primaryDate = getTaskPrimaryDate(task);
  if (!primaryDate || primaryDate.type !== "start") return false;
  const startMoment = getTaskLocalDate(primaryDate);
  return startMoment ? startMoment.getTime() > now.getTime() : false;
}
