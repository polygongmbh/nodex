import { useSyncExternalStore } from "react";
import type { TaskReactions } from "@/types";
import {
  extractReactionTargetId,
  isReactionEvent,
  normalizeReactionContent,
} from "@/infrastructure/nostr/reaction-events";
import {
  extractDeletionTargetIds,
  isDeletionEvent,
} from "@/infrastructure/nostr/deletion-events";
import { registerMemdiagStore } from "@/lib/memdiag";
import {
  isBatchingNotifications,
  registerStoreFlusher,
} from "@/lib/store-batch";

/**
 * Reaction bookkeeping is intentionally lossy: reactions are low-importance UX
 * so we trade strict correctness for a flatter storage shape. A deletion that
 * arrives before its reaction is dropped on the floor — the late-arriving
 * reaction stays visible. Duplicate-event dedup is implicit in the primary map
 * (keyed by event id).
 */

interface ReactionEventLike {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  kind: number;
}

interface ReactionRecord {
  targetId: string;
  pubkey: string;
  emoji: string;
}

const reactionsByEventId = new Map<string, ReactionRecord>();
const eventIdsByTarget = new Map<string, Set<string>>();
let viewerPubkey: string | undefined;

const reactionsByTargetId = new Map<string, TaskReactions>();
const subscribers = new Set<() => void>();

if (import.meta.env.DEV) {
  registerMemdiagStore("reactions", () => {
    let eventIdSetTotal = 0;
    for (const set of eventIdsByTarget.values()) eventIdSetTotal += set.size;
    return {
      size: reactionsByEventId.size,
      extras: {
        targets: eventIdsByTarget.size,
        eventIdSetTotal,
        publishedTargets: reactionsByTargetId.size,
        subscribers: subscribers.size,
      },
    };
  });
}

let batchedNotifyPending = false;
registerStoreFlusher(() => {
  if (!batchedNotifyPending) return false;
  batchedNotifyPending = false;
  for (const notify of subscribers) notify();
  return true;
});

function notifySubscribers(): void {
  if (isBatchingNotifications()) {
    batchedNotifyPending = true;
    return;
  }
  for (const notify of subscribers) notify();
}

function rebuildPublishedForTarget(targetId: string): boolean {
  const eventIds = eventIdsByTarget.get(targetId);
  if (!eventIds || eventIds.size === 0) {
    if (eventIds) eventIdsByTarget.delete(targetId);
    if (reactionsByTargetId.has(targetId)) {
      reactionsByTargetId.delete(targetId);
      return true;
    }
    return false;
  }
  const totals: Record<string, number> = {};
  const mineEventIdsByEmoji: Record<string, string[]> = {};
  const countedPairs = new Set<string>();
  for (const eventId of eventIds) {
    const record = reactionsByEventId.get(eventId);
    if (!record) continue;
    const pairKey = `${record.pubkey}|${record.emoji}`;
    if (!countedPairs.has(pairKey)) {
      countedPairs.add(pairKey);
      totals[record.emoji] = (totals[record.emoji] ?? 0) + 1;
    }
    if (viewerPubkey && record.pubkey === viewerPubkey) {
      (mineEventIdsByEmoji[record.emoji] ??= []).push(eventId);
    }
  }
  const mine = Object.keys(mineEventIdsByEmoji);
  const next: TaskReactions = { totals, mine, mineEventIdsByEmoji };
  const previous = reactionsByTargetId.get(targetId);
  if (areReactionsEqual(previous, next)) return false;
  reactionsByTargetId.set(targetId, next);
  return true;
}

function recordReaction(event: ReactionEventLike): string | undefined {
  if (!event.id || reactionsByEventId.has(event.id)) return undefined;
  const targetId = extractReactionTargetId(event.tags);
  if (!targetId) return undefined;
  const emoji = normalizeReactionContent(event.content);
  if (!emoji) return undefined;
  reactionsByEventId.set(event.id, { targetId, pubkey: event.pubkey, emoji });
  const ids = eventIdsByTarget.get(targetId) ?? new Set<string>();
  ids.add(event.id);
  eventIdsByTarget.set(targetId, ids);
  return targetId;
}

function recordDeletion(event: ReactionEventLike): Set<string> {
  const affected = new Set<string>();
  for (const reactionId of extractDeletionTargetIds(event.tags)) {
    const record = reactionsByEventId.get(reactionId);
    if (!record) continue;
    if (record.pubkey !== event.pubkey) continue; // only the reactor can delete
    reactionsByEventId.delete(reactionId);
    const ids = eventIdsByTarget.get(record.targetId);
    if (ids) {
      ids.delete(reactionId);
      if (ids.size === 0) eventIdsByTarget.delete(record.targetId);
    }
    affected.add(record.targetId);
  }
  return affected;
}

/**
 * Fold a batch of events into the registry. Reaction and deletion events are
 * the only kinds we look at; everything else is ignored. Duplicate events are
 * a no-op via the primary map's key.
 */
export function mergeReactionEvents(events: ReactionEventLike[]): void {
  const affected = new Set<string>();
  for (const event of events) {
    if (!event.id) continue;
    if (isDeletionEvent(event.kind)) {
      for (const targetId of recordDeletion(event)) affected.add(targetId);
    } else if (isReactionEvent(event.kind)) {
      const targetId = recordReaction(event);
      if (targetId) affected.add(targetId);
    }
  }
  let changed = false;
  for (const targetId of affected) {
    if (rebuildPublishedForTarget(targetId)) changed = true;
  }
  if (changed) notifySubscribers();
}

/**
 * Clear all state and re-fold the provided events. Use this when the relay
 * scope changes (the source list is wholly different) or when the viewer
 * pubkey changes and a clean rebuild is simpler than per-target recomputation.
 */
export function bootstrapReactions(events: ReactionEventLike[], nextViewerPubkey: string | undefined): void {
  const hadEntries = reactionsByTargetId.size > 0;
  reactionsByEventId.clear();
  eventIdsByTarget.clear();
  reactionsByTargetId.clear();
  viewerPubkey = nextViewerPubkey;
  mergeReactionEvents(events);
  // mergeReactionEvents only notifies when published snapshots change; if we
  // cleared a non-empty state, callers still need to learn about the drop.
  if (hadEntries && reactionsByTargetId.size === 0) notifySubscribers();
}

/**
 * Update the viewer pubkey and refresh the `mine` / `mineEventIdsByEmoji`
 * slice of every published snapshot. Cheaper than a full bootstrap when the
 * raw event set is unchanged.
 */
export function setReactionsViewerPubkey(nextViewerPubkey: string | undefined): void {
  if (viewerPubkey === nextViewerPubkey) return;
  viewerPubkey = nextViewerPubkey;
  let changed = false;
  for (const targetId of eventIdsByTarget.keys()) {
    if (rebuildPublishedForTarget(targetId)) changed = true;
  }
  if (changed) notifySubscribers();
}

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

/** Non-hook read for imperative call sites (e.g. unreact lookup). */
export function getReactionsForTarget(targetId: string | undefined): TaskReactions | undefined {
  if (!targetId) return undefined;
  return reactionsByTargetId.get(targetId);
}

/**
 * Drop every reaction record whose target is `targetId`. Called when the
 * host post is deleted/superseded — reactions about a post that no longer
 * exists would otherwise linger in the registry forever.
 */
export function clearReactionsForTarget(targetId: string): void {
  const eventIds = eventIdsByTarget.get(targetId);
  if (!eventIds) {
    if (reactionsByTargetId.delete(targetId)) notifySubscribers();
    return;
  }
  for (const eventId of eventIds) reactionsByEventId.delete(eventId);
  eventIdsByTarget.delete(targetId);
  const hadPublished = reactionsByTargetId.delete(targetId);
  if (eventIds.size > 0 || hadPublished) notifySubscribers();
}

/** Test helper: reset registry between cases. */
export function __resetReactionsRegistryForTests(): void {
  reactionsByEventId.clear();
  eventIdsByTarget.clear();
  reactionsByTargetId.clear();
  viewerPubkey = undefined;
  subscribers.clear();
  batchedNotifyPending = false;
}
