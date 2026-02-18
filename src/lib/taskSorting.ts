import { Task, TaskStatus } from "@/types";
import { isToday, isTomorrow, isPast, startOfDay, differenceInDays } from "date-fns";

/**
 * Shared non-feed task ordering:
 * 1) due today / overdue
 * 2) in-progress
 * 3) high priority (50+)
 * 4) upcoming due dates
 * 5) medium priority (30-49)
 * 6) no priority
 * 7) low priority (<30)
 * 8) done (kept at bottom)
 *
 * Ties break by latest modification time (desc).
 */

export interface SortContext {
  childrenMap: Map<string | undefined, Task[]>;
  allTasks: Task[];
}

type SortAwareTask = Task & { sortStatus?: TaskStatus; sortLastEditedAt?: Date };

function getStatusForSort(task: Task | undefined): TaskStatus | undefined {
  if (!task) return undefined;
  return (task as SortAwareTask).sortStatus ?? task.status;
}

// Check if a task or any of its descendants is in-progress
export function hasInProgressInTree(taskId: string, context: SortContext): boolean {
  const task = context.allTasks.find(t => t.id === taskId);
  if (getStatusForSort(task) === "in-progress") return true;
  
  const children = context.childrenMap.get(taskId) || [];
  return children.some(child => hasInProgressInTree(child.id, context));
}

// Get the earliest deadline in a task tree (task + descendants)
export function getEarliestDeadlineInTree(taskId: string, context: SortContext): Date | null {
  const task = context.allTasks.find(t => t.id === taskId);
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
  const task = context.allTasks.find(t => t.id === taskId);
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
  return (sortAwareTask.sortLastEditedAt || task.lastEditedAt || task.timestamp).getTime();
}

export function getTaskLatestModifiedMs(task: Task): number {
  return getLatestModifiedMs(task);
}

function isUpcomingDueDate(dueDate: Date | null): boolean {
  if (!dueDate) return false;
  const today = startOfDay(new Date());
  return startOfDay(dueDate).getTime() > today.getTime();
}

export function sortTasks(tasks: Task[], context: SortContext): Task[] {
  const taskById = new Map(context.allTasks.map((task) => [task.id, task] as const));
  const latestModifiedInTreeCache = new Map<string, number>();
  const highestPriorityInTreeCache = new Map<string, number | undefined>();
  const dueTodayOrPastCache = new Map<string, boolean>();
  const inProgressInTreeCache = new Map<string, boolean>();
  const earliestDeadlineInTreeCache = new Map<string, Date | null>();

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

  const highestPriorityInTree = (taskId: string): number | undefined => {
    if (highestPriorityInTreeCache.has(taskId)) {
      return highestPriorityInTreeCache.get(taskId);
    }

    const currentTask = taskById.get(taskId);
    let highest = typeof currentTask?.priority === "number" ? currentTask.priority : undefined;
    const children = context.childrenMap.get(taskId) || [];
    for (const child of children) {
      const childPriority = highestPriorityInTree(child.id);
      if (typeof childPriority === "number") {
        highest = typeof highest === "number" ? Math.max(highest, childPriority) : childPriority;
      }
    }

    highestPriorityInTreeCache.set(taskId, highest);
    return highest;
  };

  const dueTodayOrPastInTree = (taskId: string): boolean => {
    const cached = dueTodayOrPastCache.get(taskId);
    if (cached !== undefined) return cached;
    const value = hasDueTodayOrPastInTree(taskId, context);
    dueTodayOrPastCache.set(taskId, value);
    return value;
  };

  const inProgressTree = (taskId: string): boolean => {
    const cached = inProgressInTreeCache.get(taskId);
    if (cached !== undefined) return cached;
    const value = hasInProgressInTree(taskId, context);
    inProgressInTreeCache.set(taskId, value);
    return value;
  };

  const earliestDeadlineInTree = (taskId: string): Date | null => {
    if (earliestDeadlineInTreeCache.has(taskId)) {
      return earliestDeadlineInTreeCache.get(taskId) || null;
    }
    const value = getEarliestDeadlineInTree(taskId, context);
    earliestDeadlineInTreeCache.set(taskId, value);
    return value;
  };

  const getSortTier = (task: Task): number => {
    const status = getStatusForSort(task) || "todo";
    if (status === "done") return 7;

    if (dueTodayOrPastInTree(task.id)) return 0;

    const hasInProgress = status === "in-progress" || inProgressTree(task.id);
    if (hasInProgress) return 1;

    const highestPriority = highestPriorityInTree(task.id);
    if (typeof highestPriority === "number" && highestPriority >= 50) return 2;

    if (isUpcomingDueDate(earliestDeadlineInTree(task.id))) return 3;

    if (typeof highestPriority === "number" && highestPriority >= 30) return 4;
    if (typeof highestPriority === "number" && highestPriority < 30) return 6;

    return 5;
  };

  return [...tasks].sort((a, b) => {
    const aTier = getSortTier(a);
    const bTier = getSortTier(b);
    if (aTier !== bTier) return aTier - bTier;

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
export function getDueDateColorClass(dueDate: Date | undefined, status?: string): string {
  if (!dueDate || status === "done") return "text-muted-foreground";
  
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
