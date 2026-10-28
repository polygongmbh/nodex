import { getTaskState, getTaskStatus, type Post } from "@/types";
import { isTaskTerminal } from "@/domain/content/task-state";

/** Status tint shared by the month grid's day chips and multi-day bars. */
export function getCalendarChipClass(task: Post): string {
  const state = getTaskState(task);
  if (isTaskTerminal(state)) return "bg-muted text-muted-foreground line-through";
  if (getTaskStatus(state) === "active") return "bg-warning/15 text-warning";
  return "bg-primary/10";
}
