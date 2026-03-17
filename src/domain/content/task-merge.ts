import type { Task } from "@/types";

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
    byId.set(incoming.id, {
      ...(existing.timestamp.getTime() >= incoming.timestamp.getTime() ? existing : incoming),
      relays: mergedRelays,
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}
