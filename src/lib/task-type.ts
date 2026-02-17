import type { TaskType } from "@/types";

export function normalizeTaskType(value: unknown): TaskType {
  if (value === "task" || value === "comment") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "task" || normalized === "comment") {
      return normalized;
    }
  }

  // Prefer safe task defaults if submit payload is malformed.
  return "task";
}
