import { getListingReplaceableKey } from "@/domain/listings/listing-identity";
import type { Post, TaskStatus } from "@/types";

const LISTING_EVENT_KIND = 30402;

export function dedupeMergedTasks(tasks: Post[]): Post[] {
  const byId = new Map<string, Post>();
  const byListingReplaceableKey = new Map<string, Post>();
  let collided = false;

  for (const task of tasks) {
    const listingReplaceableKey = getListingReplaceableKey(task, LISTING_EVENT_KIND);
    if (!listingReplaceableKey) {
      const existing = byId.get(task.id);
      if (!existing) {
        byId.set(task.id, task);
        continue;
      }
      collided = true;
      if (existing.timestamp.getTime() < task.timestamp.getTime()) {
        byId.set(task.id, task);
      }
      continue;
    }

    const existing = byListingReplaceableKey.get(listingReplaceableKey);
    if (!existing) {
      byListingReplaceableKey.set(listingReplaceableKey, task);
      continue;
    }
    collided = true;
    if (
      task.timestamp.getTime() > existing.timestamp.getTime() ||
      (task.timestamp.getTime() === existing.timestamp.getTime() && task.id > existing.id)
    ) {
      byListingReplaceableKey.set(listingReplaceableKey, task);
    }
  }

  const out = collided
    ? [...byId.values(), ...byListingReplaceableKey.values()]
    : tasks.slice();
  return out.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function applyTaskSortOverlays(
  tasks: Post[],
  sortStatusHoldByTaskId: Record<string, TaskStatus>,
  sortModifiedAtHoldByTaskId: Record<string, string>
): Post[] {
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
