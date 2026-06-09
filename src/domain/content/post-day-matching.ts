import { addDays, format, startOfDay } from "date-fns";
import { getPostDateEntries, type Post } from "@/types";
import { getTaskLocalDate } from "@/lib/task-dates";

/** Canonical day-bucket key, matching the calendar selectors' bucketing. */
export function formatDayKey(date: Date): string {
  return format(startOfDay(date), "yyyy-MM-dd");
}

/**
 * Day keys of every date the post references: task due/scheduled/milestone
 * entries and event days, with start→end ranges expanded day-by-day (same
 * range semantics as the calendar view's day bucketing). Posts without date
 * entries (e.g. comments) yield an empty set.
 */
export function getPostDateDayKeys(post: Post): Set<string> {
  const keys = new Set<string>();
  const entries = getPostDateEntries(post);
  if (entries.length === 0) return keys;

  const startEntry = entries.find((entry) => entry.type === "start");
  const endEntry = entries.find((entry) => entry.type === "end");
  const start = startEntry ? getTaskLocalDate(startEntry) : undefined;
  const end = endEntry ? getTaskLocalDate(endEntry) : undefined;
  const rangeStart = start && end ? startOfDay(start <= end ? start : end) : null;
  const rangeEnd = start && end ? startOfDay(start <= end ? end : start) : null;
  if (rangeStart && rangeEnd) {
    for (let cursor = rangeStart; cursor.getTime() <= rangeEnd.getTime(); cursor = addDays(cursor, 1)) {
      keys.add(formatDayKey(cursor));
    }
  }
  for (const entry of entries) {
    if (rangeStart && (entry.type === "start" || entry.type === "end")) continue;
    const entryDate = getTaskLocalDate(entry);
    if (entryDate) keys.add(formatDayKey(entryDate));
  }
  return keys;
}

/** Whether one of the post's referenced dates falls on the day. */
export function postHasDateOnDay(post: Post, dayKey: string): boolean {
  return getPostDateDayKeys(post).has(dayKey);
}

/**
 * Whether the post belongs to the day's activity: created on that day, or
 * referencing a date on that day. The broader rule used by the home timeline;
 * the my-tasks panel uses {@link postHasDateOnDay} (referenced dates only).
 */
export function postOccursOnDay(post: Post, dayKey: string): boolean {
  if (formatDayKey(post.timestamp) === dayKey) return true;
  return postHasDateOnDay(post, dayKey);
}

/** Union of referenced-date day keys across posts — drives the mini-calendar dots. */
export function collectEventDayKeys(posts: Post[]): Set<string> {
  const keys = new Set<string>();
  for (const post of posts) {
    for (const key of getPostDateDayKeys(post)) keys.add(key);
  }
  return keys;
}
