import { Task, TaskStatus } from "@/types";

export function isTaskCompletedStatus(status: TaskStatus | undefined): status is "done" {
  return status === "done";
}

export function isTaskTerminalStatus(
  status: TaskStatus | undefined
): status is "done" | "closed" {
  return status === "done" || status === "closed";
}

export function cycleTaskStatus(current: TaskStatus | undefined): TaskStatus {
  if (current === "todo" || !current) return "in-progress";
  if (current === "in-progress") return "done";
  return "todo";
}

export function applyTaskStatusUpdate(
  localTasks: Task[],
  allTasks: Task[],
  taskId: string,
  newStatus: TaskStatus,
  completedBy?: string
): Task[] {
  const now = new Date();
  const toLocalStatusUpdatedTask = (task: Task): Task => {
    return {
      ...task,
      status: newStatus,
      lastEditedAt: now,
      completedBy: isTaskCompletedStatus(newStatus) ? completedBy : undefined,
    };
  };
  const existingIndex = localTasks.findIndex((task) => task.id === taskId);

  if (existingIndex >= 0) {
    return localTasks.map((task) =>
      task.id === taskId ? toLocalStatusUpdatedTask(task) : task
    );
  }

  const sourceTask = allTasks.find((task) => task.id === taskId);
  if (!sourceTask) return localTasks;

  return [
    toLocalStatusUpdatedTask(sourceTask),
    ...localTasks,
  ];
}
