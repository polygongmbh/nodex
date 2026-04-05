export const DEFAULT_TASK_EDIT_MODE = "assignee_or_creator";

export type TaskEditMode = "assignee_or_creator" | "everyone";

function parseTaskEditMode(value: unknown): TaskEditMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "everyone") return "everyone";
  if (normalized === "assignee_or_creator") return "assignee_or_creator";
  return DEFAULT_TASK_EDIT_MODE;
}

export function resolveTaskEditMode(env: Record<string, unknown> = import.meta.env): TaskEditMode {
  return parseTaskEditMode(env.VITE_TASK_EDIT_MODE);
}
