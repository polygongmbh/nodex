import { getListingReplaceableKey } from "@/domain/listings/listing-identity";
import type { Post, TaskStatus } from "@/types";

const LISTING_EVENT_KIND = 30402;

export function dedupeMergedTasks(tasks: Post[]): Post[] {
  const byId = new Map<string, Post>();
  const byListingReplaceableKey = new Map<string, Post>();

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
