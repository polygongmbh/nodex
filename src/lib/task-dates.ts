import type { Task, TaskDateType } from "@/types";
import i18n from "@/lib/i18n/config";

const DATE_TYPE_LABEL_KEYS: Record<TaskDateType, string> = {
  due: "composer.dates.due",
  scheduled: "composer.dates.scheduled",
  start: "composer.dates.start",
  end: "composer.dates.end",
  milestone: "composer.dates.milestone",
};

export function getTaskDateTypeLabel(dateType: TaskDateType | undefined): string {
  const key = dateType ? DATE_TYPE_LABEL_KEYS[dateType] || DATE_TYPE_LABEL_KEYS.due : DATE_TYPE_LABEL_KEYS.due;
  return i18n.t(`composer:${key}`);
}

export function isTaskLockedUntilStart(task: Task, now: Date = new Date()): boolean {
  if (task.dateType !== "start" || !task.dueDate) return false;
  return task.dueDate.getTime() > now.getTime();
}
