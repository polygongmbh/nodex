import type { PostType, TaskEntryType } from "@/types";

export type ComposerMessageType = PostType;

export function normalizeTaskType(value: unknown): TaskEntryType {
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

export function normalizeComposerMessageType(value: unknown): ComposerMessageType {
  if (value === "task" || value === "comment" || value === "offer" || value === "request") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "task" || normalized === "comment" || normalized === "offer" || normalized === "request") {
      return normalized;
    }
  }

  return "task";
}
