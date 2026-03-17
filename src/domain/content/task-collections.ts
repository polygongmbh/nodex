import { getListingReplaceableKey } from "@/lib/nostr/listing-replaceable-key";
import type { Task, TaskStatus } from "@/types";

const LISTING_EVENT_KIND = 30402;

export function buildPendingPublishDedupKey(task: Task): string {
  const authorId = task.author.id?.trim().toLowerCase() || "";
  const normalizedContent = task.content.trim();
  const normalizedTags = [...task.tags].map((tag) => tag.trim().toLowerCase()).sort().join(",");
  const feedMessageType = task.feedMessageType || "";
  const parentId = task.parentId || "";
  return `${authorId}|${task.taskType}|${feedMessageType}|${parentId}|${normalizedTags}|${normalizedContent}`;
}

export function filterPendingLocalTasksForMerge(localTasks: Task[], nostrTasks: Task[]): Task[] {
  const nostrTaskDedupKeys = new Set(nostrTasks.map((task) => buildPendingPublishDedupKey(task)));
  return localTasks.filter((task) => {
    if (!task.pendingPublishToken) return true;
    return !nostrTaskDedupKeys.has(buildPendingPublishDedupKey(task));
  });
}

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
  sortStatusHoldByTaskId: Record<string, TaskStatus>,
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
