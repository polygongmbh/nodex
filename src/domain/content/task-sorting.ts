import { Task, TaskStatusLike, TaskStatusType, getLastEditedAt, getTaskStatusType } from "@/types";
import { isTaskTerminalStatus } from "./task-status";
import { getTaskStateUiType } from "@/domain/task-states/task-state-config";
import { isToday, isPast, startOfDay, differenceInDays } from "date-fns";
import { evaluateTaskPriorities, type PriorityScore } from "./task-priority-evaluation";

/**
 * Shared non-feed task ordering:
 * 1) evaluated task priority (urgency, importance, frecency, and tree context)
 * 2) less-complete tasks
 * 3) latest modification time
 * 4) deterministic task id
 *
 * Terminal tasks are kept at the bottom.
 *
 * Ties break by latest modification time (desc).
 */

export interface SortContext {
  childrenMap: Map<string | undefined, Task[]>;
  allTasks: Task[];
  taskById?: Map<string, Task>;
  priorityScores?: Map<string, PriorityScore>;
  now?: number;
}

type SortAwareTask = Task & { sortStatus?: TaskStatusType; sortLastEditedAt?: Date };

function getStatusForSort(task: Task | undefined): TaskStatusType | undefined {
  if (!task) return undefined;
  return (task as SortAwareTask).sortStatus ?? getTaskStatusType(task.status);
}

function getTaskById(taskId: string, context: SortContext): Task | undefined {
  if (context.taskById) return context.taskById.get(taskId);
  return context.allTasks.find((task) => task.id === taskId);
}

// Check if a task or any of its descendants is in-progress
export function hasActiveInTree(taskId: string, context: SortContext): boolean {
  const task = getTaskById(taskId, context);
  if (getTaskStateUiType(getStatusForSort(task)) === "active") return true;
  
  const children = context.childrenMap.get(taskId) || [];
  return children.some(child => hasActiveInTree(child.id, context));
}

// Get the earliest deadline in a task tree (task + descendants)
export function getEarliestDeadlineInTree(taskId: string, context: SortContext): Date | null {
  const task = getTaskById(taskId, context);
  let earliest: Date | null = task?.dueDate || null;
  
  const children = context.childrenMap.get(taskId) || [];
  for (const child of children) {
    const childEarliest = getEarliestDeadlineInTree(child.id, context);
    if (childEarliest) {
      if (!earliest || childEarliest < earliest) {
        earliest = childEarliest;
      }
    }
  }
  
  return earliest;
}

// Check if task or any descendant is due today or past
export function hasDueTodayOrPastInTree(taskId: string, context: SortContext): boolean {
  const task = getTaskById(taskId, context);
  if (task?.dueDate) {
    const dueDay = startOfDay(task.dueDate);
    if (isToday(dueDay) || isPast(dueDay)) {
      return true;
    }
  }
  
  const children = context.childrenMap.get(taskId) || [];
  return children.some(child => hasDueTodayOrPastInTree(child.id, context));
}

function getLatestModifiedMs(task: Task | undefined): number {
  if (!task) return Number.NEGATIVE_INFINITY;
  const sortAwareTask = task as SortAwareTask;
  return (sortAwareTask.sortLastEditedAt || getLastEditedAt(task)).getTime();
}

export function getTaskLatestModifiedMs(task: Task): number {
  return getLatestModifiedMs(task);
}

export function sortTasks(tasks: Task[], context: SortContext): Task[] {
  const taskById = context.taskById ?? new Map(context.allTasks.map((task) => [task.id, task] as const));
  const latestModifiedInTreeCache = new Map<string, number>();
  const priorityScores =
    context.priorityScores ?? evaluateTaskPriorities(context.allTasks, context.now);

  const latestModifiedInTree = (taskId: string): number => {
    const cached = latestModifiedInTreeCache.get(taskId);
    if (cached !== undefined) return cached;

    const currentTask = taskById.get(taskId);
    let latest = getLatestModifiedMs(currentTask);
    const children = context.childrenMap.get(taskId) || [];
    for (const child of children) {
      latest = Math.max(latest, latestModifiedInTree(child.id));
    }

    latestModifiedInTreeCache.set(taskId, latest);
    return latest;
  };

  return [...tasks].sort((a, b) => {
    const aTerminal = isTaskTerminalStatus(getStatusForSort(a) || "open");
    const bTerminal = isTaskTerminalStatus(getStatusForSort(b) || "open");
    if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;

    const aScore = priorityScores.get(a.id);
    const bScore = priorityScores.get(b.id);
    if (aScore && bScore) {
      if (aScore.priority !== bScore.priority) {
        return bScore.priority - aScore.priority;
      }
      if (aScore.progress !== bScore.progress) {
        return aScore.progress - bScore.progress;
      }
    } else if (aScore || bScore) {
      return aScore ? -1 : 1;
    }

    const aLatestModified = latestModifiedInTree(a.id);
    const bLatestModified = latestModifiedInTree(b.id);
    if (aLatestModified !== bLatestModified) return bLatestModified - aLatestModified;

    // Keep deterministic order for identical tier/timestamps.
    return a.id.localeCompare(b.id);
  });
}

// Build children map from tasks
export function buildChildrenMap(allTasks: Task[]): Map<string | undefined, Task[]> {
  const map = new Map<string | undefined, Task[]>();
  allTasks.forEach(task => {
    const parentId = task.parentId;
    if (!map.has(parentId)) {
      map.set(parentId, []);
    }
    map.get(parentId)!.push(task);
  });
  return map;
}

// Get due date color class based on urgency
export function getDueDateColorClass(dueDate: Date | undefined, status?: TaskStatusLike): string {
  if (!dueDate || isTaskTerminalStatus(status)) return "text-muted-foreground";
  
  const today = startOfDay(new Date());
  const dueDay = startOfDay(dueDate);
  const daysUntilDue = differenceInDays(dueDay, today);
  
  if (daysUntilDue < 0) {
    // Overdue - red
    return "text-destructive";
  } else if (daysUntilDue === 0) {
    // Due today - orange
    return "text-warning";
  } else if (daysUntilDue <= 2) {
    // Next few days - yellow
    return "text-due-near";
  } else if (daysUntilDue <= 5) {
    // Mid-near horizon - yellow/green transition
    return "text-due-mid";
  } else if (daysUntilDue <= 14) {
    // Farther out - greener
    return "text-due-far";
  }
  
  // Distant due dates stay green-toned
  return "text-due-distant";
}
