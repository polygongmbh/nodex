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

/**
 * Reaction bookkeeping is kept incremental: each ingested reaction or deletion
 * event folds into the internal state in O(1), and the published TaskReactions
 * snapshot for an affected target is rebuilt only for that target. The viewer
 * pubkey (used to populate `mine` / `mineEventIdsByEmoji`) can change over
 * time, so we keep the raw per-target/pubkey/emoji map and recompute the
 * viewer-facing slice when needed.
 */

interface ReactionEventLike {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  kind: number;
}

// targetId -> pubkey -> emoji -> Set<eventId>
type ByTarget = Map<string, Map<string, Map<string, Set<string>>>>;
// reactor pubkey -> set of reaction event IDs they have published a deletion for
type DeletedByAuthor = Map<string, Set<string>>;
// reaction event ID -> coordinates for cleanup if a deletion arrives later
interface ReactionCoord {
  targetId: string;
  pubkey: string;
  emoji: string;
}

const byTarget: ByTarget = new Map();
const deletedByAuthor: DeletedByAuthor = new Map();
const reactionCoordById = new Map<string, ReactionCoord>();
const processedEventIds = new Set<string>();
let viewerPubkey: string | undefined;

const reactionsByTargetId = new Map<string, TaskReactions>();
const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  for (const notify of subscribers) notify();
}

function rebuildPublishedForTarget(targetId: string): boolean {
  const byPubkey = byTarget.get(targetId);
  if (!byPubkey || byPubkey.size === 0) {
    if (reactionsByTargetId.has(targetId)) {
      reactionsByTargetId.delete(targetId);
      return true;
    }
    return false;
  }
  const totals: Record<string, number> = {};
  const mine: string[] = [];
  const mineEventIdsByEmoji: Record<string, string[]> = {};
  for (const [pubkey, byEmoji] of byPubkey) {
    for (const [emoji, ids] of byEmoji) {
      if (ids.size === 0) continue;
      totals[emoji] = (totals[emoji] ?? 0) + 1;
      if (viewerPubkey && pubkey === viewerPubkey) {
        mine.push(emoji);
        mineEventIdsByEmoji[emoji] = [
          ...(mineEventIdsByEmoji[emoji] ?? []),
          ...Array.from(ids),
        ];
      }
    }
  }
  const next: TaskReactions = { totals, mine, mineEventIdsByEmoji };
  const previous = reactionsByTargetId.get(targetId);
  if (areReactionsEqual(previous, next)) return false;
  reactionsByTargetId.set(targetId, next);
  return true;
}

function recordReaction(event: ReactionEventLike): string | undefined {
  if (!event.id) return undefined;
  // A deletion for this reaction may have arrived before the reaction itself.
  if (deletedByAuthor.get(event.pubkey)?.has(event.id)) return undefined;
  const targetId = extractReactionTargetId(event.tags);
  if (!targetId) return undefined;
  const emoji = normalizeReactionContent(event.content);
  if (!emoji) return undefined;
  const byPubkey = byTarget.get(targetId) ?? new Map<string, Map<string, Set<string>>>();
  const byEmoji = byPubkey.get(event.pubkey) ?? new Map<string, Set<string>>();
  const ids = byEmoji.get(emoji) ?? new Set<string>();
  ids.add(event.id);
  byEmoji.set(emoji, ids);
  byPubkey.set(event.pubkey, byEmoji);
  byTarget.set(targetId, byPubkey);
  reactionCoordById.set(event.id, { targetId, pubkey: event.pubkey, emoji });
  return targetId;
}

function recordDeletion(event: ReactionEventLike): Set<string> {
  const affected = new Set<string>();
  const targetIds = extractDeletionTargetIds(event.tags);
  if (targetIds.length === 0) return affected;
  const set = deletedByAuthor.get(event.pubkey) ?? new Set<string>();
  for (const reactionId of targetIds) {
    set.add(reactionId);
    const coord = reactionCoordById.get(reactionId);
    if (!coord) continue;
    if (coord.pubkey !== event.pubkey) continue; // only the reactor can delete
    const byPubkey = byTarget.get(coord.targetId);
    const byEmoji = byPubkey?.get(coord.pubkey);
    const ids = byEmoji?.get(coord.emoji);
    if (ids) {
      ids.delete(reactionId);
      if (ids.size === 0) byEmoji?.delete(coord.emoji);
      if (byEmoji && byEmoji.size === 0) byPubkey?.delete(coord.pubkey);
      if (byPubkey && byPubkey.size === 0) byTarget.delete(coord.targetId);
    }
    reactionCoordById.delete(reactionId);
    affected.add(coord.targetId);
  }
  deletedByAuthor.set(event.pubkey, set);
  return affected;
}

/**
 * Fold a batch of events into the registry. Reaction and deletion events are
 * the only kinds we look at; everything else is ignored. Events already seen
 * (by id) are skipped, so repeated invocations are idempotent.
 */
export function mergeReactionEvents(events: ReactionEventLike[]): void {
  const affected = new Set<string>();
  for (const event of events) {
    if (!event.id || processedEventIds.has(event.id)) continue;
    if (isDeletionEvent(event.kind)) {
      processedEventIds.add(event.id);
      for (const targetId of recordDeletion(event)) affected.add(targetId);
    } else if (isReactionEvent(event.kind)) {
      processedEventIds.add(event.id);
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
  byTarget.clear();
  deletedByAuthor.clear();
  reactionCoordById.clear();
  processedEventIds.clear();
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
  for (const targetId of byTarget.keys()) {
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

/** Test helper: reset registry between cases. */
export function __resetReactionsRegistryForTests(): void {
  byTarget.clear();
  deletedByAuthor.clear();
  reactionCoordById.clear();
  processedEventIds.clear();
  reactionsByTargetId.clear();
  viewerPubkey = undefined;
  subscribers.clear();
}
