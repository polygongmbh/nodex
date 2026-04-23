import { Task, TaskStatus } from "@/types";
import {
  isTaskCompletedState,
  isTaskTerminalState as registryIsTerminal,
  getQuickToggleNextState,
  getTaskStateRegistry,
} from "@/domain/task-states/task-state-config";

export function isTaskCompletedStatus(status: TaskStatus | undefined): boolean {
  return isTaskCompletedState(status);
}

export function isTaskTerminalStatus(status: TaskStatus | undefined): boolean {
  return registryIsTerminal(status);
}

export function cycleTaskStatus(current: TaskStatus | undefined): TaskStatus {
  const next = getQuickToggleNextState(current);
  if (next !== null) return next as TaskStatus;
  // Terminal states cycle back to first state
  return (getTaskStateRegistry()[0]?.id ?? "open") as TaskStatus;
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
