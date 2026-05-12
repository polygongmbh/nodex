import { Task, TaskState, TaskStatusType, getTaskStatusType, normalizeTaskState } from "@/types";
import {
  isTaskCompletedState,
  isTaskTerminalState as registryIsTerminal,
} from "@/domain/task-states/task-state-config";

export function isTaskCompletedStatus(status: TaskState | TaskStatusType | undefined): boolean {
  return isTaskCompletedState(getTaskStatusType(status));
}

export function isTaskTerminalStatus(status: TaskState | TaskStatusType | undefined): boolean {
  return registryIsTerminal(getTaskStatusType(status));
}

export function applyTaskStateUpdate(
  localTasks: Task[],
  allTasks: Task[],
  taskId: string,
  newStatus: TaskState | TaskStatusType,
  _authorPubkey?: string
): Task[] {
  const now = new Date();
  const normalized = normalizeTaskState(newStatus);
  const toLocalStatusUpdatedTask = (task: Task): Task => {
    return {
      ...task,
      state: normalized,
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
