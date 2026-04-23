import type { Task } from "@/types";
import { getLastEditedAt } from "@/types";

function mergeStateUpdates(existing: Task["stateUpdates"], incoming: Task["stateUpdates"]): Task["stateUpdates"] {
  const combined = [...(existing || []), ...(incoming || [])];
  if (combined.length === 0) return undefined;
  const byId = new Map<string, NonNullable<Task["stateUpdates"]>[number]>();
  for (const update of combined) {
    const previous = byId.get(update.id);
    if (!previous || update.timestamp.getTime() >= previous.timestamp.getTime()) {
      byId.set(update.id, update);
    }
  }
  return Array.from(byId.values()).sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
}

function getLatestEditedAt(task: Task): Date {
  const latestStateTimestamp = task.stateUpdates?.[0]?.timestamp;
  const editedAt = getLastEditedAt(task);
  if (!latestStateTimestamp) return editedAt;
  return latestStateTimestamp.getTime() >= editedAt.getTime()
    ? latestStateTimestamp
    : editedAt;
}

export function mergeTasks(existingTasks: Task[], newTasks: Task[]): Task[] {
  const byId = new Map<string, Task>();
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
    const mergedStateUpdates = mergeStateUpdates(existing.stateUpdates, incoming.stateUpdates);
    const winner = existing.timestamp.getTime() >= incoming.timestamp.getTime() ? existing : incoming;
    const latestMergedState = mergedStateUpdates?.[0];
    const mergedTask: Task = {
      ...winner,
      relays: mergedRelays,
      stateUpdates: mergedStateUpdates,
      status: latestMergedState?.status.type ?? winner.status,
      statusDescription: latestMergedState?.status.description ?? winner.statusDescription,
    };
    mergedTask.lastEditedAt = getLatestEditedAt(mergedTask);
    byId.set(incoming.id, mergedTask);
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}
