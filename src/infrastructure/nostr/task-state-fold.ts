import { isTaskPost, type Post, type TaskStateUpdate } from "@/types";
import { canPubkeyUpdateTask } from "@/domain/content/task-permissions";
import {
  extractTaskStateTargetId,
  isTaskStateEventKind,
  mapTaskStateEventToTaskStatus,
} from "@/infrastructure/nostr/task-state-events";

/**
 * Minimal shape of a NIP-state event needed to fold it into a Post.
 * Includes the fields that drive permissions, ordering, and content mapping.
 */
export interface TaskStateEventLike {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/**
 * Fold a single state event into a Post.
 *
 * Returns the updated Post when the event applies; returns the input Post
 * untouched when the event does not target this post, fails permissions,
 * has the wrong kind, or duplicates an already-recorded update id. Designed
 * so the caller can swap the new Post into its map only when identity
 * actually changed.
 *
 * The bulk batch path (`nostrEventsToTasks`) and an incremental ingest path
 * can share this function — repeated calls yield the same final shape as
 * applying the full set at once, because order is normalized via the sort
 * inside `stateUpdates` and `lastEditedAt` advances monotonically.
 */
export function foldTaskStateEventIntoPost(post: Post, event: TaskStateEventLike): Post {
  if (!isTaskPost(post)) return post;
  if (!isTaskStateEventKind(event.kind)) return post;
  const targetId = extractTaskStateTargetId(event.tags);
  if (!targetId || targetId !== post.id) return post;
  if (!canPubkeyUpdateTask(post, event.pubkey)) return post;
  if (post.stateUpdates.some((entry) => entry.id === event.id)) return post;

  const mapped = mapTaskStateEventToTaskStatus(event.kind, event.content);
  const update: TaskStateUpdate = {
    id: event.id,
    state: mapped,
    timestamp: new Date(event.created_at * 1000),
    authorPubkey: event.pubkey,
  };
  const stateUpdates = [...post.stateUpdates, update].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );
  const eventMillis = event.created_at * 1000;
  const currentLastEditedMillis = (post.lastEditedAt ?? post.timestamp).getTime();
  return {
    ...post,
    stateUpdates,
    ...(eventMillis > currentLastEditedMillis && {
      lastEditedAt: new Date(eventMillis),
    }),
  };
}

/**
 * Fold many state events into a Post. Convenience for callers that already
 * have an event batch; for streamed ingest, calling `foldTaskStateEventIntoPost`
 * one at a time produces the same final result.
 */
export function foldTaskStateEventsIntoPost(post: Post, events: TaskStateEventLike[]): Post {
  let next = post;
  for (const event of events) {
    next = foldTaskStateEventIntoPost(next, event);
  }
  return next;
}
