import { useSyncExternalStore } from "react";
import type { Post } from "@/types";
import {
  applyDatesToPost,
  foldDateUpdateIntoMap,
  foldPriorityUpdateIntoPost,
  foldStateUpdateIntoPost,
  type PostDateLatestMap,
  type PostDateUpdateRequest,
  type PostDeletionRequest,
  type PostPriorityUpdateRequest,
  type PostStateUpdateRequest,
} from "@/domain/content/post-updates";
import { registerMemdiagStore } from "@/lib/memdiag";
import { deleteRawEvent } from "@/stores/raw-events";
import { clearReactionsForTarget } from "./reactions-registry";

// Side-store cleanup: when a Post leaves postsById (deleted/superseded),
// drop its raw-event entry and its reaction records too. The Post is the
// canonical owner of those side stores' keys — they have no other source
// of truth, so without this hook they grow with churn.
function releaseSideStoresForPost(postId: string): void {
  deleteRawEvent(postId);
  clearReactionsForTarget(postId);
}

// Stores Post objects keyed by id. The store does NOT know about Nostr
// events — every input is already a typed Post or a typed fold/delete
// request. The boundary (post-event-ingest) handles the conversion.

const postsById = new Map<string, Post>();
const replaceableKeyToPostId = new Map<string, string>();
// Reverse of `replaceableKeyToPostId`: lets `applyDeletion` evict the
// address mapping in O(1) when its target post leaves the store, instead of
// scanning every entry. Kept in lockstep — only mutated alongside the
// forward map.
const postIdToReplaceableKey = new Map<string, string>();

// Tombstone: a deletion event from author A targeting id X is recorded as
// (A, X). When a post arrives with author A and id X, it is rejected. Other
// authors' deletions of the same id are NOT honored (matches NIP-09).
const deletionsByAuthor = new Map<string, Set<string>>();

// Per-post date bookkeeping. Lives outside the Post so we can do the
// "latest by created_at per type" merge incrementally without storing
// the timestamp on the user-facing Post.
const datesByPostId = new Map<string, PostDateLatestMap>();
const priorityTimestampByPostId = new Map<string, number>();

// Folds that arrived before their target Post. Once the Post lands, we
// replay these and clear the bucket. Bounded by a soft cap to keep memory
// flat in pathological streams.
const PENDING_FOLDS_CAP = 5000;
interface PendingFolds {
  states: PostStateUpdateRequest[];
  dates: PostDateUpdateRequest[];
  priorities: PostPriorityUpdateRequest[];
}
const pendingFoldsByTargetId = new Map<string, PendingFolds>();
let pendingFoldsCount = 0;

const subscribers = new Set<() => void>();
let version = 0;
let cachedSnapshot: Post[] = [];
let cachedSnapshotAtVersion = -1;
let suppressedIds: ReadonlySet<string> = new Set();

if (import.meta.env.DEV) {
  registerMemdiagStore("posts", () => ({
    size: postsById.size,
    extras: {
      replaceableKeys: replaceableKeyToPostId.size,
      datesByPostId: datesByPostId.size,
      priorityTimestamps: priorityTimestampByPostId.size,
      deletionAuthors: deletionsByAuthor.size,
      pendingFoldTargets: pendingFoldsByTargetId.size,
      pendingFoldsCount,
      cachedSnapshotLen: cachedSnapshot.length,
      subscribers: subscribers.size,
    },
  }));
}

function notifyChange(): void {
  version += 1;
  for (const subscriber of subscribers) subscriber();
}

function getPendingBucket(targetId: string): PendingFolds {
  let bucket = pendingFoldsByTargetId.get(targetId);
  if (!bucket) {
    bucket = { states: [], dates: [], priorities: [] };
    pendingFoldsByTargetId.set(targetId, bucket);
  }
  return bucket;
}

function trimPendingFolds(): void {
  while (pendingFoldsCount > PENDING_FOLDS_CAP && pendingFoldsByTargetId.size > 0) {
    // Drop the oldest insertion (Map iteration order is insertion order).
    const oldestKey = pendingFoldsByTargetId.keys().next().value;
    if (oldestKey === undefined) break;
    const bucket = pendingFoldsByTargetId.get(oldestKey);
    if (!bucket) {
      pendingFoldsByTargetId.delete(oldestKey);
      continue;
    }
    pendingFoldsCount -= bucket.states.length + bucket.dates.length + bucket.priorities.length;
    pendingFoldsByTargetId.delete(oldestKey);
  }
}

function isDeletedByOwnAuthor(authorPubkey: string, postId: string): boolean {
  return deletionsByAuthor.get(authorPubkey)?.has(postId) ?? false;
}

function applyPendingFolds(post: Post): Post {
  const bucket = pendingFoldsByTargetId.get(post.id);
  if (!bucket) return post;
  let next = post;
  for (const state of bucket.states) {
    next = foldStateUpdateIntoPost(next, state);
  }
  let dateMap: PostDateLatestMap | undefined;
  for (const dateUpdate of bucket.dates) {
    dateMap = foldDateUpdateIntoMap(dateMap, dateUpdate);
  }
  if (dateMap && dateMap.size > 0) {
    datesByPostId.set(post.id, dateMap);
    next = applyDatesToPost(next, dateMap);
  }
  let priorityTimestamp = priorityTimestampByPostId.get(post.id) ?? 0;
  for (const priorityUpdate of bucket.priorities) {
    const folded = foldPriorityUpdateIntoPost(next, priorityUpdate, priorityTimestamp);
    if (folded) {
      next = folded.post;
      priorityTimestamp = folded.timestampMs;
    }
  }
  if (priorityTimestamp > 0) priorityTimestampByPostId.set(post.id, priorityTimestamp);
  pendingFoldsCount -= bucket.states.length + bucket.dates.length + bucket.priorities.length;
  pendingFoldsByTargetId.delete(post.id);
  return next;
}

export interface IngestPostInput {
  post: Post;
  replaceableKey?: string | null;
}

export function ingestPost({ post, replaceableKey }: IngestPostInput): boolean {
  if (isDeletedByOwnAuthor(post.author.pubkey, post.id)) return false;

  if (replaceableKey) {
    const existingId = replaceableKeyToPostId.get(replaceableKey);
    if (existingId && existingId !== post.id) {
      const existing = postsById.get(existingId);
      if (existing && existing.timestamp.getTime() > post.timestamp.getTime()) {
        // Newer existing wins; drop the incoming.
        return false;
      }
      postsById.delete(existingId);
      datesByPostId.delete(existingId);
      priorityTimestampByPostId.delete(existingId);
      postIdToReplaceableKey.delete(existingId);
      releaseSideStoresForPost(existingId);
    }
    replaceableKeyToPostId.set(replaceableKey, post.id);
    postIdToReplaceableKey.set(post.id, replaceableKey);
  }

  const withFolds = applyPendingFolds(post);
  postsById.set(withFolds.id, withFolds);
  notifyChange();
  return true;
}

export function applyStateUpdate(update: PostStateUpdateRequest): void {
  const post = postsById.get(update.targetId);
  if (!post) {
    if (isDeletedByOwnAuthor(update.authorPubkey, update.targetId)) return;
    const bucket = getPendingBucket(update.targetId);
    bucket.states.push(update);
    pendingFoldsCount += 1;
    trimPendingFolds();
    return;
  }
  const folded = foldStateUpdateIntoPost(post, update);
  if (folded === post) return;
  postsById.set(post.id, folded);
  notifyChange();
}

export function applyDateUpdate(update: PostDateUpdateRequest): void {
  const post = postsById.get(update.targetId);
  if (!post) {
    const bucket = getPendingBucket(update.targetId);
    bucket.dates.push(update);
    pendingFoldsCount += 1;
    trimPendingFolds();
    return;
  }
  const dateMap = foldDateUpdateIntoMap(datesByPostId.get(post.id), update);
  datesByPostId.set(post.id, dateMap);
  const next = applyDatesToPost(post, dateMap);
  if (next === post) return;
  postsById.set(post.id, next);
  notifyChange();
}

export function applyPriorityUpdate(update: PostPriorityUpdateRequest): void {
  const post = postsById.get(update.targetId);
  if (!post) {
    const bucket = getPendingBucket(update.targetId);
    bucket.priorities.push(update);
    pendingFoldsCount += 1;
    trimPendingFolds();
    return;
  }
  const previousTimestamp = priorityTimestampByPostId.get(post.id) ?? 0;
  const folded = foldPriorityUpdateIntoPost(post, update, previousTimestamp);
  if (!folded) return;
  postsById.set(post.id, folded.post);
  priorityTimestampByPostId.set(post.id, folded.timestampMs);
  notifyChange();
}

export function applyDeletion(deletion: PostDeletionRequest): void {
  let authorTombstones = deletionsByAuthor.get(deletion.byPubkey);
  if (!authorTombstones) {
    authorTombstones = new Set();
    deletionsByAuthor.set(deletion.byPubkey, authorTombstones);
  }
  let removedAny = false;
  for (const targetId of deletion.targetIds) {
    authorTombstones.add(targetId);
    const existing = postsById.get(targetId);
    if (existing && existing.author.pubkey === deletion.byPubkey) {
      postsById.delete(targetId);
      datesByPostId.delete(targetId);
      priorityTimestampByPostId.delete(targetId);
      const replaceableKey = postIdToReplaceableKey.get(targetId);
      if (replaceableKey) {
        replaceableKeyToPostId.delete(replaceableKey);
        postIdToReplaceableKey.delete(targetId);
      }
      releaseSideStoresForPost(targetId);
      removedAny = true;
    }
    const pending = pendingFoldsByTargetId.get(targetId);
    if (pending) {
      pendingFoldsCount -= pending.states.length + pending.dates.length + pending.priorities.length;
      pendingFoldsByTargetId.delete(targetId);
    }
  }
  if (removedAny) notifyChange();
}

export function setPostsSuppression(ids: ReadonlySet<string>): void {
  if (ids === suppressedIds) return;
  if (ids.size === suppressedIds.size && [...ids].every((id) => suppressedIds.has(id))) return;
  suppressedIds = ids;
  notifyChange();
}

function projectPosts(): Post[] {
  if (cachedSnapshotAtVersion === version) return cachedSnapshot;
  const out: Post[] = [];
  for (const post of postsById.values()) {
    if (suppressedIds.has(post.id)) continue;
    out.push(post);
  }
  cachedSnapshot = out;
  cachedSnapshotAtVersion = version;
  return cachedSnapshot;
}

export function getPosts(): Post[] {
  return projectPosts();
}

/**
 * Canonical id → Post map. Stable reference across store changes — consumers
 * should treat it as readonly and key memo invalidation off getPostsVersion()
 * (or off allTasks identity, which already changes with the store version).
 * Replaces per-view `new Map(allTasks.map(...))` clones that previously ran
 * in every view-state hook on every re-derive.
 */
export function getPostsByIdMap(): ReadonlyMap<string, Post> {
  return postsById;
}

/**
 * Resolve a readonly id → Post map for a view that already has the post list
 * in hand. In production allTasks is derived from this store so the canonical
 * Map contains every entry — we just return it (zero allocation). In tests
 * that pass synthetic Post[] without seeding the store, the cheap presence
 * check fails and we build a local Map from allTasks.
 */
export function resolvePostsByIdFor(allTasks: ReadonlyArray<Post>): ReadonlyMap<string, Post> {
  if (allTasks.length === 0) return postsById;
  if (postsById.has(allTasks[0].id)) return postsById;
  const local = new Map<string, Post>();
  for (const post of allTasks) local.set(post.id, post);
  return local;
}

export function getPostsVersion(): number {
  return version;
}

/**
 * Resolve the current post id stored at a parameterized-replaceable address
 * (`<kind>:<pubkey>:<d>`). Used by the deletion path to translate `a`-tag
 * deletions into the id-keyed deletion the store understands.
 */
export function getPostIdByReplaceableKey(address: string): string | undefined {
  return replaceableKeyToPostId.get(address);
}

export function subscribeToPosts(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function usePosts(): Post[] {
  useSyncExternalStore(subscribeToPosts, getPostsVersion, getPostsVersion);
  return getPosts();
}

export function __resetPostsStoreForTests(): void {
  postsById.clear();
  replaceableKeyToPostId.clear();
  postIdToReplaceableKey.clear();
  deletionsByAuthor.clear();
  datesByPostId.clear();
  priorityTimestampByPostId.clear();
  pendingFoldsByTargetId.clear();
  pendingFoldsCount = 0;
  cachedSnapshot = [];
  cachedSnapshotAtVersion = -1;
  version = 0;
  suppressedIds = new Set();
  subscribers.clear();
}
