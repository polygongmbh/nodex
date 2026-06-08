import { useCallback, useSyncExternalStore } from "react";
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
 * so we trade strict correctness for a flat storage shape. We keep at most one
 * reaction per (post, reactor) — a second emoji from the same person overwrites
 * the first. A deletion that arrives before its reaction is dropped on the
 * floor. Storage is a single `postId -> reactorPubkey -> reaction` map; deletion
 * scans it (rare, so O(#posts) is fine), and keying by reactor pubkey enforces
 * "only the reactor can delete their reaction" for free.
 */

interface ReactionEventLike {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  kind: number;
}

interface Reaction {
  id: string;
  pubkey: string;
  targetId: string;
  emoji: string;
}

// postId -> reactor pubkey -> their (single) reaction
const reactionsByTarget = new Map<string, Map<string, Reaction>>();
let viewerPubkey: string | undefined;

const reactionsByTargetId = new Map<string, TaskReactions>();
// Subscribers are tracked per target id rather than as a single global Set.
// With one TaskCard subscription per visible post, a list of N posts adds N
// entries; a global notify path would wake all N on every reaction event
// (only one of which would actually re-render). Per-target dispatch wakes
// exactly the cards whose target changed.
const subscribersByTarget = new Map<string, Set<() => void>>();
let subscriberCount = 0;

if (import.meta.env.DEV) {
  registerMemdiagStore("reactions", () => {
    let total = 0;
    for (const byPubkey of reactionsByTarget.values()) total += byPubkey.size;
    return {
      size: total,
      extras: {
        targets: reactionsByTarget.size,
        publishedTargets: reactionsByTargetId.size,
        subscribers: subscriberCount,
        subscribedTargets: subscribersByTarget.size,
      },
    };
  });
}

// Pending wake-ups while the router drain has batching enabled. Drained by
// the store-batch flusher below.
let dirtyTargets = new Set<string>();

registerStoreFlusher(() => {
  if (dirtyTargets.size === 0) return false;
  const targets = dirtyTargets;
  dirtyTargets = new Set();
  for (const id of targets) {
    const subs = subscribersByTarget.get(id);
    if (!subs) continue;
    for (const cb of subs) cb();
  }
  return true;
});

function notifyTargets(targetIds: Iterable<string>): void {
  if (isBatchingNotifications()) {
    for (const id of targetIds) dirtyTargets.add(id);
    return;
  }
  for (const id of targetIds) {
    const subs = subscribersByTarget.get(id);
    if (!subs) continue;
    for (const cb of subs) cb();
  }
}

function rebuildPublishedForTarget(targetId: string): boolean {
  const byPubkey = reactionsByTarget.get(targetId);
  if (!byPubkey || byPubkey.size === 0) {
    if (byPubkey) reactionsByTarget.delete(targetId);
    if (reactionsByTargetId.has(targetId)) {
      reactionsByTargetId.delete(targetId);
      return true;
    }
    return false;
  }
  const totals: Record<string, number> = {};
  const mineEventIdsByEmoji: Record<string, string[]> = {};
  for (const record of byPubkey.values()) {
    totals[record.emoji] = (totals[record.emoji] ?? 0) + 1;
    if (viewerPubkey && record.pubkey === viewerPubkey) {
      (mineEventIdsByEmoji[record.emoji] ??= []).push(record.id);
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
  if (!event.id) return undefined;
  const targetId = extractReactionTargetId(event.tags);
  if (!targetId) return undefined;
  const emoji = normalizeReactionContent(event.content);
  if (!emoji) return undefined;
  const byPubkey = reactionsByTarget.get(targetId) ?? new Map<string, Reaction>();
  byPubkey.set(event.pubkey, { id: event.id, pubkey: event.pubkey, targetId, emoji });
  reactionsByTarget.set(targetId, byPubkey);
  return targetId;
}

function recordDeletion(event: ReactionEventLike): Set<string> {
  const affected = new Set<string>();
  const deletedIds = new Set(extractDeletionTargetIds(event.tags));
  if (deletedIds.size === 0) return affected;
  for (const [targetId, byPubkey] of reactionsByTarget) {
    const record = byPubkey.get(event.pubkey); // only the reactor can delete
    if (!record || !deletedIds.has(record.id)) continue;
    byPubkey.delete(event.pubkey);
    if (byPubkey.size === 0) reactionsByTarget.delete(targetId);
    affected.add(targetId);
  }
  return affected;
}

/**
 * Fold a batch of events into the registry. Reaction and deletion events are
 * the only kinds we look at; everything else is ignored. Re-merging the same
 * reaction re-sets an equal record → snapshot unchanged → no notify.
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
  const actuallyChanged = new Set<string>();
  for (const targetId of affected) {
    if (rebuildPublishedForTarget(targetId)) actuallyChanged.add(targetId);
  }
  if (actuallyChanged.size > 0) notifyTargets(actuallyChanged);
}

/**
 * Clear all state and re-fold the provided events. Use this when the relay
 * scope changes (the source list is wholly different) or when the viewer
 * pubkey changes and a clean rebuild is simpler than per-target recomputation.
 */
export function bootstrapReactions(events: ReactionEventLike[], nextViewerPubkey: string | undefined): void {
  // Snapshot previously-published targets BEFORE the clear so their
  // subscribers learn that the entry dropped (mergeReactionEvents only fires
  // for the new targets it actually folds).
  const previouslyPublished = new Set(reactionsByTargetId.keys());
  reactionsByTarget.clear();
  reactionsByTargetId.clear();
  viewerPubkey = nextViewerPubkey;
  mergeReactionEvents(events);
  const dropped = new Set<string>();
  for (const targetId of previouslyPublished) {
    if (!reactionsByTargetId.has(targetId)) dropped.add(targetId);
  }
  if (dropped.size > 0) notifyTargets(dropped);
}

/**
 * Update the viewer pubkey and refresh the `mine` / `mineEventIdsByEmoji`
 * slice of every published snapshot. Cheaper than a full bootstrap when the
 * raw event set is unchanged.
 */
export function setReactionsViewerPubkey(nextViewerPubkey: string | undefined): void {
  if (viewerPubkey === nextViewerPubkey) return;
  viewerPubkey = nextViewerPubkey;
  const changed = new Set<string>();
  for (const targetId of reactionsByTarget.keys()) {
    if (rebuildPublishedForTarget(targetId)) changed.add(targetId);
  }
  if (changed.size > 0) notifyTargets(changed);
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

function subscribeForTarget(targetId: string, callback: () => void): () => void {
  let set = subscribersByTarget.get(targetId);
  if (!set) {
    set = new Set();
    subscribersByTarget.set(targetId, set);
  }
  set.add(callback);
  subscriberCount += 1;
  return () => {
    set!.delete(callback);
    subscriberCount -= 1;
    if (set!.size === 0) subscribersByTarget.delete(targetId);
  };
}

// Used by useReactionsFor when targetId is undefined — the hook always has to
// call useSyncExternalStore unconditionally, but with no target there's
// nothing to subscribe to, so this is a no-op subscription that never fires.
const noopSubscribe = () => () => {};

export function useReactionsFor(targetId: string | undefined): TaskReactions | undefined {
  // Memoize subscribe per targetId so useSyncExternalStore doesn't
  // re-subscribe on every render.
  const subscribe = useCallback(
    (cb: () => void) => (targetId ? subscribeForTarget(targetId, cb) : noopSubscribe()),
    [targetId],
  );
  const getSnapshot = useCallback(
    () => (targetId ? reactionsByTargetId.get(targetId) : undefined),
    [targetId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

/** Non-hook read for imperative call sites (e.g. unreact lookup). */
export function getReactionsForTarget(targetId: string | undefined): TaskReactions | undefined {
  if (!targetId) return undefined;
  return reactionsByTargetId.get(targetId);
}

/**
 * On-demand read of who reacted, grouped `emoji -> reactor pubkeys[]`. Returns
 * `{}` for unknown targets. The "who reacted" popup calls this when it opens so
 * the reactor pubkeys never have to live in the published snapshot.
 */
export function getReactorsForTarget(targetId: string | undefined): Record<string, string[]> {
  if (!targetId) return {};
  const byPubkey = reactionsByTarget.get(targetId);
  if (!byPubkey) return {};
  const result: Record<string, string[]> = {};
  for (const record of byPubkey.values()) {
    (result[record.emoji] ??= []).push(record.pubkey);
  }
  return result;
}

/**
 * Drop every reaction record whose target is `targetId`. Called when the
 * host post is deleted/superseded — reactions about a post that no longer
 * exists would otherwise linger in the registry forever.
 */
export function clearReactionsForTarget(targetId: string): void {
  const byPubkey = reactionsByTarget.get(targetId);
  if (!byPubkey) {
    if (reactionsByTargetId.delete(targetId)) notifyTargets([targetId]);
    return;
  }
  reactionsByTarget.delete(targetId);
  const hadPublished = reactionsByTargetId.delete(targetId);
  if (byPubkey.size > 0 || hadPublished) notifyTargets([targetId]);
}

/** Test helper: reset registry between cases. */
export function __resetReactionsRegistryForTests(): void {
  reactionsByTarget.clear();
  reactionsByTargetId.clear();
  viewerPubkey = undefined;
  subscribersByTarget.clear();
  subscriberCount = 0;
  dirtyTargets = new Set();
}
