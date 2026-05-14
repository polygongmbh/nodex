import type { Post, TaskStateUpdate } from "@/types";
import { getLastEditedAt, getTaskStateUpdates, isTaskPost } from "@/types";
import { areTaskFieldsEqual } from "./task-identity";

function mergeStateUpdates(
  existing: TaskStateUpdate[],
  incoming: TaskStateUpdate[]
): TaskStateUpdate[] {
  const combined = [...existing, ...incoming];
  if (combined.length === 0) return [];
  const byId = new Map<string, TaskStateUpdate>();
  for (const update of combined) {
    const previous = byId.get(update.id);
    if (!previous || update.timestamp.getTime() >= previous.timestamp.getTime()) {
      byId.set(update.id, update);
    }
  }
  return Array.from(byId.values()).sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
}

function getLatestEditedAt(task: Post): Date {
  const latestStateTimestamp = getTaskStateUpdates(task)[0]?.timestamp;
  const editedAt = getLastEditedAt(task);
  if (!latestStateTimestamp) return editedAt;
  return latestStateTimestamp.getTime() >= editedAt.getTime()
    ? latestStateTimestamp
    : editedAt;
}

export function mergeTasks(existingTasks: Post[], newTasks: Post[]): Post[] {
  const byId = new Map<string, Post>();
  for (const task of existingTasks) {
    byId.set(task.id, task);
  }
  for (const incoming of newTasks) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    const mergedRelays = Array.from(
      new Set([...(existing.relays || []), ...(incoming.relays || [])])
    );
    const winner: Post = existing.timestamp.getTime() >= incoming.timestamp.getTime() ? existing : incoming;
    const mergedTask: Post = isTaskPost(winner)
      ? {
          ...winner,
          relays: mergedRelays,
          stateUpdates: mergeStateUpdates(
            getTaskStateUpdates(existing),
            getTaskStateUpdates(incoming)
          ),
        }
      : { ...winner, relays: mergedRelays };
    mergedTask.lastEditedAt = getLatestEditedAt(mergedTask);
    // Reuse the existing reference when the merged values match — prevents
    // identity churn for tasks present in both lists across repeated calls.
    byId.set(incoming.id, areTaskFieldsEqual(existing, mergedTask) ? existing : mergedTask);
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}
