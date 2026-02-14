import { Task, TaskStatus } from "@/types";

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
  const existingIndex = localTasks.findIndex((task) => task.id === taskId);

  if (existingIndex >= 0) {
    return localTasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: newStatus,
            completedBy: newStatus === "done" ? completedBy : undefined,
          }
        : task
    );
  }

  const sourceTask = allTasks.find((task) => task.id === taskId);
  if (!sourceTask) return localTasks;

  return [
    {
      ...sourceTask,
      status: newStatus,
      completedBy: newStatus === "done" ? completedBy : undefined,
    },
    ...localTasks,
  ];
}
