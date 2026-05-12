import { getListingReplaceableKey } from "@/domain/listings/listing-identity";
import type { Task, TaskStatusType } from "@/types";

const LISTING_EVENT_KIND = 30402;

export function dedupeMergedTasks(tasks: Task[]): Task[] {
  const byId = new Map<string, Task>();
  const byListingReplaceableKey = new Map<string, Task>();

  for (const task of tasks) {
    const listingReplaceableKey = getListingReplaceableKey(task, LISTING_EVENT_KIND);
    if (!listingReplaceableKey) {
      const existing = byId.get(task.id);
      if (!existing) {
        byId.set(task.id, task);
        continue;
      }
      const mergedRelays = Array.from(new Set([...existing.relays, ...task.relays]));
      byId.set(task.id, {
        ...(existing.timestamp.getTime() >= task.timestamp.getTime() ? existing : task),
        relays: mergedRelays,
      });
      continue;
    }

    const existing = byListingReplaceableKey.get(listingReplaceableKey);
    if (
      !existing ||
      task.timestamp.getTime() > existing.timestamp.getTime() ||
      (task.timestamp.getTime() === existing.timestamp.getTime() && task.id > existing.id)
    ) {
      byListingReplaceableKey.set(listingReplaceableKey, task);
    }
  }

  return [...byId.values(), ...byListingReplaceableKey.values()].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}

export function applyTaskSortOverlays(
  tasks: Task[],
  sortStatusHoldByTaskId: Record<string, TaskStatusType>,
  sortModifiedAtHoldByTaskId: Record<string, string>
): Task[] {
  return tasks
    .map((task) => {
      const sortStatus = sortStatusHoldByTaskId[task.id];
      const sortLastEditedAtIso = sortModifiedAtHoldByTaskId[task.id];
      if (!sortStatus && !sortLastEditedAtIso) return task;
      return {
        ...task,
        ...(sortStatus ? { sortStatus } : {}),
        ...(sortLastEditedAtIso ? { sortLastEditedAt: new Date(sortLastEditedAtIso) } : {}),
      };
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
