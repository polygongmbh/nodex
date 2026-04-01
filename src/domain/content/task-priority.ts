const MIN_DISPLAY_PRIORITY = 1;
const MAX_DISPLAY_PRIORITY = 5;
const DISPLAY_PRIORITY_MULTIPLIER = 20;
const MIN_STORED_PRIORITY = MIN_DISPLAY_PRIORITY * DISPLAY_PRIORITY_MULTIPLIER;
const MAX_STORED_PRIORITY = MAX_DISPLAY_PRIORITY * DISPLAY_PRIORITY_MULTIPLIER;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function displayPriorityFromStored(priority?: number): number | undefined {
  if (typeof priority !== "number" || !Number.isFinite(priority)) return undefined;
  return clamp(Math.round(priority / DISPLAY_PRIORITY_MULTIPLIER), MIN_DISPLAY_PRIORITY, MAX_DISPLAY_PRIORITY);
}

export function storedPriorityFromDisplay(priority?: number): number | undefined {
  if (typeof priority !== "number" || !Number.isFinite(priority)) return undefined;
  return clamp(
    Math.round(priority),
    MIN_DISPLAY_PRIORITY,
    MAX_DISPLAY_PRIORITY,
  ) * DISPLAY_PRIORITY_MULTIPLIER;
}

export function formatPriorityLabel(priority?: number): string {
  const displayPriority = displayPriorityFromStored(priority);
  return typeof displayPriority === "number" ? `P${displayPriority}` : "";
}

export const DISPLAY_PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const;
export const MAX_DISPLAY_PRIORITY_DIGITS = String(MAX_DISPLAY_PRIORITY).length;
export const MAX_RECENT_DAYS_DIGITS = String(365).length;
