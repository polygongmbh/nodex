import { Task, TaskStatusLike, TaskStatusType, getTaskStatusType, normalizeTaskStatus } from "@/types";
import {
  isTaskCompletedState,
  isTaskTerminalState as registryIsTerminal,
} from "@/domain/task-states/task-state-config";

export function isTaskCompletedStatus(status: TaskStatusLike): boolean {
  return isTaskCompletedState(getTaskStatusType(status));
}

export function isTaskTerminalStatus(status: TaskStatusLike): boolean {
  return registryIsTerminal(getTaskStatusType(status));
}

export function applyTaskStatusUpdate(
  localTasks: Task[],
  allTasks: Task[],
  taskId: string,
  newStatus: TaskStatusType
): Task[] {
  const now = new Date();
  const toLocalStatusUpdatedTask = (task: Task): Task => {
    return {
      ...task,
      status: normalizeTaskStatus(newStatus),
      lastEditedAt: now,
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
