import type { Post, TaskDateType, TaskState, TaskStateUpdate } from "@/types";
import type { TaskDate } from "@/types";
import { canPubkeyUpdateTask } from "@/domain/content/task-permissions";
import { isTaskPost } from "@/types";

// Typed updates the posts-store consumes. Nothing here references Nostr —
// the boundary in src/infrastructure/nostr/post-event-ingest.ts converts
// raw events into these shapes before handing them to the store.

export interface PostStateUpdateRequest {
  targetId: string;
  updateId: string;
  newState: TaskState;
  authorPubkey: string;
  timestampMs: number;
}

export interface PostDateUpdateRequest {
  targetId: string;
  authorPubkey: string;
  entry: TaskDate;
  timestampMs: number;
}

export interface PostPriorityUpdateRequest {
  targetId: string;
  authorPubkey: string;
  priority: number;
  timestampMs: number;
}

export interface PostDeletionRequest {
  targetIds: string[];
  byPubkey: string;
}

const TASK_DATE_TYPE_ORDER: TaskDateType[] = ["due", "scheduled", "start", "end", "milestone"];

function getLastEditedAtMs(post: Post): number {
  return (post.lastEditedAt ?? post.timestamp).getTime();
}

export function foldStateUpdateIntoPost(post: Post, update: PostStateUpdateRequest): Post {
  if (!isTaskPost(post)) return post;
  if (update.targetId !== post.id) return post;
  if (!canPubkeyUpdateTask(post, update.authorPubkey)) return post;
  if (post.stateUpdates.some((entry) => entry.id === update.updateId)) return post;

  const stateUpdate: TaskStateUpdate = {
    id: update.updateId,
    state: update.newState,
    timestamp: new Date(update.timestampMs),
    authorPubkey: update.authorPubkey,
  };
  const stateUpdates = [...post.stateUpdates, stateUpdate].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  const next: Post = { ...post, stateUpdates };
  if (update.timestampMs > getLastEditedAtMs(post)) {
    next.lastEditedAt = new Date(update.timestampMs);
  }
  return next;
}

interface PostDateSlot {
  timestampMs: number;
  entry: TaskDate;
}

// Per-post storage of the latest-by-created_at date per type. Lives outside
// the Post so consumers don't see it.
export type PostDateLatestMap = Map<TaskDateType, PostDateSlot>;

// Mutates `perType` in place (or returns a fresh map when undefined). Both
// callers in posts-store immediately replace the previous bucket with the
// result, so the prior defensive `new Map(perType)` shallow-copy was pure
// per-event allocation churn during hydration with no observable benefit.
export function foldDateUpdateIntoMap(
  perType: PostDateLatestMap | undefined,
  update: PostDateUpdateRequest
): PostDateLatestMap {
  const next: PostDateLatestMap = perType ?? new Map();
  const previous = next.get(update.entry.type);
  if (previous && update.timestampMs < previous.timestampMs) return next;
  next.set(update.entry.type, {
    timestampMs: update.timestampMs,
    entry: update.entry,
  });
  return next;
}

export function applyDatesToPost(post: Post, perType: PostDateLatestMap): Post {
  if (!isTaskPost(post)) return post;
  const dates = TASK_DATE_TYPE_ORDER.flatMap((type) => {
    const slot = perType.get(type);
    return slot ? [slot.entry] : [];
  });
  let latestTimestampMs = 0;
  for (const slot of perType.values()) {
    if (slot.timestampMs > latestTimestampMs) latestTimestampMs = slot.timestampMs;
  }
  const next: Post = { ...post, dates };
  if (latestTimestampMs > getLastEditedAtMs(post)) {
    next.lastEditedAt = new Date(latestTimestampMs);
  }
  return next;
}

export function foldPriorityUpdateIntoPost(
  post: Post,
  update: PostPriorityUpdateRequest,
  previousTimestampMs: number
): { post: Post; timestampMs: number } | null {
  if (!isTaskPost(post)) return null;
  if (update.targetId !== post.id) return null;
  if (!canPubkeyUpdateTask(post, update.authorPubkey)) return null;
  if (update.timestampMs < previousTimestampMs) return null;
  if (post.priority === update.priority && update.timestampMs <= previousTimestampMs) {
    return null;
  }
  const next: Post = { ...post, priority: update.priority };
  if (update.timestampMs > getLastEditedAtMs(post)) {
    next.lastEditedAt = new Date(update.timestampMs);
  }
  return { post: next, timestampMs: update.timestampMs };
}
