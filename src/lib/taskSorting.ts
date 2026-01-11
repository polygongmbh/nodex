import { Task } from "@/types";
import { isToday, isPast, startOfDay } from "date-fns";

/**
 * Sorting priority for tasks:
 * 1. Tasks due today or in the past (overdue)
 * 2. Tasks in progress (or with in-progress descendants)
 * 3. Open tasks with closest deadline first
 * 4. Other open tasks (no deadline)
 * 5. Done tasks
 */

export interface SortContext {
  childrenMap: Map<string | undefined, Task[]>;
  allTasks: Task[];
}

// Check if a task or any of its descendants is in-progress
export function hasInProgressInTree(taskId: string, context: SortContext): boolean {
  const task = context.allTasks.find(t => t.id === taskId);
  if (task?.status === "in-progress") return true;
  
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

export function sortTasks(tasks: Task[], context: SortContext): Task[] {
  return [...tasks].sort((a, b) => {
    const aStatus = a.status || "todo";
    const bStatus = b.status || "todo";
    
    // Done tasks always last
    if (aStatus === "done" && bStatus !== "done") return 1;
    if (aStatus !== "done" && bStatus === "done") return -1;
    if (aStatus === "done" && bStatus === "done") return 0;
    
    // Check for due today or overdue (considering descendants)
    const aDueTodayOrPast = hasDueTodayOrPastInTree(a.id, context);
    const bDueTodayOrPast = hasDueTodayOrPastInTree(b.id, context);
    
    if (aDueTodayOrPast && !bDueTodayOrPast) return -1;
    if (!aDueTodayOrPast && bDueTodayOrPast) return 1;
    
    // Check in-progress status (considering descendants)
    const aHasInProgress = aStatus === "in-progress" || hasInProgressInTree(a.id, context);
    const bHasInProgress = bStatus === "in-progress" || hasInProgressInTree(b.id, context);
    
    if (aHasInProgress && !bHasInProgress) return -1;
    if (!aHasInProgress && bHasInProgress) return 1;
    
    // Sort by earliest deadline in tree
    const aEarliest = getEarliestDeadlineInTree(a.id, context);
    const bEarliest = getEarliestDeadlineInTree(b.id, context);
    
    if (aEarliest && !bEarliest) return -1;
    if (!aEarliest && bEarliest) return 1;
    if (aEarliest && bEarliest) {
      return aEarliest.getTime() - bEarliest.getTime();
    }
    
    return 0;
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
