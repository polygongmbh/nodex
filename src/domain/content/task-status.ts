import { Task, TaskStatus, getTaskStatusType } from "@/types";
import {
  isTaskCompletedState,
  isTaskTerminalState as registryIsTerminal,
} from "@/domain/task-states/task-state-config";

export function isTaskCompletedStatus(status: TaskStatus | undefined): boolean {
  return isTaskCompletedState(getTaskStatusType(status));
}

export function isTaskTerminalStatus(status: TaskStatus | undefined): boolean {
  return registryIsTerminal(getTaskStatusType(status));
}

export function applyTaskStatusUpdate(
  localTasks: Task[],
  allTasks: Task[],
  taskId: string,
  newStatus: TaskStatus,
  _authorPubkey?: string
): Task[] {
  const now = new Date();
  const toLocalStatusUpdatedTask = (task: Task): Task => {
    return {
      ...task,
      status: newStatus,
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
