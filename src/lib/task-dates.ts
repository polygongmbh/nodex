import type { Task, TaskDateType } from "@/types";

const DATE_TYPE_LABELS: Record<TaskDateType, string> = {
  due: "Due",
  scheduled: "Scheduled",
  start: "Start",
  end: "End",
  milestone: "Milestone",
};

export function getTaskDateTypeLabel(dateType: TaskDateType | undefined): string {
  if (!dateType) return DATE_TYPE_LABELS.due;
  return DATE_TYPE_LABELS[dateType] || DATE_TYPE_LABELS.due;
}

export function isTaskLockedUntilStart(task: Task, now: Date = new Date()): boolean {
  if (task.dateType !== "start" || !task.dueDate) return false;
  return task.dueDate.getTime() > now.getTime();
}
