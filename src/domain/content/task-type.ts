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
  if (value === "task" || value === "comment" || value === "listing") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "task" || normalized === "comment" || normalized === "listing") {
      return normalized;
    }
  }

  return "task";
}
