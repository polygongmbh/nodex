import type { QuickFilterState, Post } from "@/types";
import { getLastEditedAt, getTaskPriority } from "@/types";

export const DEFAULT_RECENT_DAYS = 7;
export const DEFAULT_MIN_PRIORITY = 50;

const MIN_RECENT_DAYS = 1;
const MAX_RECENT_DAYS = 365;
const MIN_PRIORITY = 0;
const MAX_PRIORITY = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export function clampRecentDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RECENT_DAYS;
  return Math.max(MIN_RECENT_DAYS, Math.min(MAX_RECENT_DAYS, Math.round(value)));
}

export function clampMinPriority(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MIN_PRIORITY;
  return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(value)));
}

export function normalizeQuickFilterState(input?: Partial<QuickFilterState> | null): QuickFilterState {
  return {
    recentEnabled: input?.recentEnabled === true,
    recentDays: clampRecentDays(typeof input?.recentDays === "number" ? input.recentDays : DEFAULT_RECENT_DAYS),
    priorityEnabled: input?.priorityEnabled === true,
    minPriority: clampMinPriority(typeof input?.minPriority === "number" ? input.minPriority : DEFAULT_MIN_PRIORITY),
  };
}

export function taskMatchesQuickFilters(
  task: Post,
  quickFilters: QuickFilterState,
  nowMs = Date.now()
): boolean {
  if (quickFilters.recentEnabled) {
    const activityTimestampMs = getLastEditedAt(task).getTime();
    const ageMs = Math.max(0, nowMs - activityTimestampMs);
    const ageDays = ageMs / DAY_MS;
    if (ageDays > quickFilters.recentDays) {
      return false;
    }
  }

  if (quickFilters.priorityEnabled) {
    const priority = getTaskPriority(task);
    if (typeof priority !== "number") return false;
    if (priority < quickFilters.minPriority) return false;
  }

  return true;
}
