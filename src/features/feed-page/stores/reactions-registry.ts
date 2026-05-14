import { useSyncExternalStore } from "react";
import type { TaskReactions } from "@/types";

const reactionsByTargetId = new Map<string, TaskReactions>();
const subscribers = new Set<() => void>();

function areReactionsEqual(a: TaskReactions | undefined, b: TaskReactions | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aKeys = Object.keys(a.totals);
  const bKeys = Object.keys(b.totals);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a.totals[key] !== b.totals[key]) return false;
  }
  if (a.mine.length !== b.mine.length) return false;
  const mine = new Set(a.mine);
  for (const emoji of b.mine) {
    if (!mine.has(emoji)) return false;
  }
  const aMineKeys = Object.keys(a.mineEventIdsByEmoji);
  const bMineKeys = Object.keys(b.mineEventIdsByEmoji);
  if (aMineKeys.length !== bMineKeys.length) return false;
  for (const emoji of aMineKeys) {
    const aIds = a.mineEventIdsByEmoji[emoji] ?? [];
    const bIds = b.mineEventIdsByEmoji[emoji] ?? [];
    if (aIds.length !== bIds.length) return false;
    const set = new Set(aIds);
    for (const id of bIds) {
      if (!set.has(id)) return false;
    }
  }
  return true;
}

export function setReactionsByTargetId(next: Map<string, TaskReactions>): void {
  let changed = false;
  for (const id of reactionsByTargetId.keys()) {
    if (!next.has(id)) {
      reactionsByTargetId.delete(id);
      changed = true;
    }
  }
  for (const [id, value] of next) {
    const current = reactionsByTargetId.get(id);
    if (!areReactionsEqual(current, value)) {
      reactionsByTargetId.set(id, value);
      changed = true;
    }
  }
  if (changed) {
    for (const notify of subscribers) notify();
  }
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

export function useReactionsFor(targetId: string | undefined): TaskReactions | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (targetId ? reactionsByTargetId.get(targetId) : undefined),
    () => undefined,
  );
}

/** Test helper: reset registry between cases. */
export function __resetReactionsRegistryForTests(): void {
  reactionsByTargetId.clear();
  subscribers.clear();
}
