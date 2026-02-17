import { Task } from "@/types";
import { isToday, isTomorrow, isPast, startOfDay, differenceInDays } from "date-fns";

/**
 * Cumulative sorting for tasks:
 * - Due date urgency (sooner = higher priority)
 * - Status priority: in-progress > todo > done
 * Combined into a single score for sorting
 */

export interface SortContext {
  childrenMap: Map<string | undefined, Task[]>;
  allTasks: Task[];
}

// Get due date urgency score (lower = more urgent, null = least urgent)
function getDueDateScore(dueDate: Date | undefined): number {
  if (!dueDate) return 1000; // No due date = lowest priority
  
  const today = startOfDay(new Date());
  const dueDay = startOfDay(dueDate);
  const daysUntilDue = differenceInDays(dueDay, today);
  
  // Overdue tasks get negative scores (more urgent)
  // Today = 0, tomorrow = 1, etc.
  return daysUntilDue;
}

// Get status priority score (lower = higher priority)
function getStatusScore(status: string | undefined): number {
  switch (status) {
    case "in-progress": return 0;
    case "todo": return 1;
    case "done": return 2;
    default: return 1;
  }
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
    
    // Get earliest deadline considering tree
    const aEarliest = getEarliestDeadlineInTree(a.id, context);
    const bEarliest = getEarliestDeadlineInTree(b.id, context);
    
    // Calculate combined scores (due date + status)
    const aDueDateScore = getDueDateScore(aEarliest || undefined);
    const bDueDateScore = getDueDateScore(bEarliest || undefined);
    
    // Check in-progress status (considering descendants)
    const aHasInProgress = aStatus === "in-progress" || hasInProgressInTree(a.id, context);
    const bHasInProgress = bStatus === "in-progress" || hasInProgressInTree(b.id, context);
    
    const aStatusScore = aHasInProgress ? 0 : getStatusScore(aStatus);
    const bStatusScore = bHasInProgress ? 0 : getStatusScore(bStatus);
    
    // Primary sort by due date urgency
    if (aDueDateScore !== bDueDateScore) {
      return aDueDateScore - bDueDateScore;
    }
    
    // Secondary sort by status priority
    if (aStatusScore !== bStatusScore) {
      return aStatusScore - bStatusScore;
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
    return "text-yellow-500";
  } else if (daysUntilDue <= 5) {
    // Mid-near horizon - yellow/green transition
    return "text-lime-500";
  } else if (daysUntilDue <= 14) {
    // Farther out - greener
    return "text-green-500";
  }
  
  // Distant due dates stay green-toned
  return "text-emerald-500";
}
