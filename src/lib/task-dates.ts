import type { Task, TaskDateType } from "@/types";
import i18n from "@/lib/i18n/config";

export const TASK_DATE_TYPES: TaskDateType[] = ["due", "scheduled", "start", "end", "milestone"];

export function getTaskDateTypeLabel(dateType: TaskDateType | undefined): string {
  const safeDateType = dateType && TASK_DATE_TYPES.includes(dateType) ? dateType : "due";
  return i18n.t(`tasks:tasks.dates.${safeDateType}`);
}

export function isTaskLockedUntilStart(task: Task, now: Date = new Date()): boolean {
  if (task.dateType !== "start" || !task.dueDate) return false;
  return task.dueDate.getTime() > now.getTime();
}
