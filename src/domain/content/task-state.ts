import { Task, TaskState, TaskStatus, getTaskStatus, normalizeTaskState } from "@/types";
import {
  isTaskCompletedState,
  isTaskTerminalState as registryIsTerminal,
} from "@/domain/task-states/task-state-config";

export function isTaskCompleted(state: TaskState | TaskStatus | undefined): boolean {
  return isTaskCompletedState(getTaskStatus(state));
}

export function isTaskTerminal(state: TaskState | TaskStatus | undefined): boolean {
  return registryIsTerminal(getTaskStatus(state));
}

export function applyTaskStateUpdate(
  localTasks: Task[],
  allTasks: Task[],
  taskId: string,
  newStatus: TaskState | TaskStatus,
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
