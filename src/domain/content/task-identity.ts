import type { Task, TaskStateUpdate, TaskState } from "@/types";

/**
 * Returns `previous` when `fresh` carries the same signal-bearing values, so
 * downstream React.memo'd consumers don't churn on every event-cache flush
 * (NDK subscriptions stream events for several seconds after page load and
 * `nostrEventsToTasks` rebuilds every Task object from scratch each time).
 */
export function preserveTaskIdentity(previous: Task | undefined, fresh: Task): Task {
  if (!previous) return fresh;
  if (previous === fresh) return previous;
  if (previous.id !== fresh.id) return fresh;
  return areTaskFieldsEqual(previous, fresh) ? previous : fresh;
}

export function preserveTaskListIdentity(previous: readonly Task[], fresh: Task[]): Task[] {
  if (previous.length === 0) return fresh;
  const previousById = new Map<string, Task>();
  for (const task of previous) previousById.set(task.id, task);
  return fresh.map((task) => preserveTaskIdentity(previousById.get(task.id), task));
}

export function areTaskFieldsEqual(a: Task, b: Task): boolean {
  if (a === b) return true;
  if (a.timestamp.getTime() !== b.timestamp.getTime()) return false;
  if ((a.lastEditedAt?.getTime() ?? 0) !== (b.lastEditedAt?.getTime() ?? 0)) return false;
  if (a.content !== b.content) return false;
  if (a.kind !== b.kind) return false;
  if (a.parentId !== b.parentId) return false;
  if (a.priority !== b.priority) return false;
  if (a.dueTime !== b.dueTime) return false;
  if ((a.dueDate?.getTime() ?? 0) !== (b.dueDate?.getTime() ?? 0)) return false;
  if (a.dateType !== b.dateType) return false;
  if (a.author.pubkey !== b.author.pubkey) return false;
  if (!areStateUpdateListsEqual(a.stateUpdates, b.stateUpdates)) return false;
  if (!areStringListsEqual(a.relays, b.relays)) return false;
  if (!areStringListsEqual(a.tags, b.tags)) return false;
  if (!areOptionalStringListsEqual(a.assigneePubkeys, b.assigneePubkeys)) return false;
  if (!areOptionalStringListsEqual(a.mentions, b.mentions)) return false;
  return true;
}

function areStatusEqual(a: TaskState | undefined, b: TaskState | undefined): boolean {
  if (a === b) return true;
  if (a?.status !== b?.status) return false;
  return a?.description === b?.description;
}

function areStateUpdateListsEqual(
  a: TaskStateUpdate[] | undefined,
  b: TaskStateUpdate[] | undefined
): boolean {
  if (a === b) return true;
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  for (let i = 0; i < aLen; i++) {
    const left = a![i];
    const right = b![i];
    if (left.id !== right.id) return false;
    if (left.timestamp.getTime() !== right.timestamp.getTime()) return false;
    if (left.authorPubkey !== right.authorPubkey) return false;
    if (!areStatusEqual(left.state, right.state)) return false;
  }
  return true;
}

function areStringListsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areOptionalStringListsEqual(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === (b?.length ?? 0);
  return areStringListsEqual(a, b);
}
