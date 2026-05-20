import type { Post } from "@/types";
import { isTaskPost } from "@/types";
import { mergeTasks } from "@/domain/content/task-merge";

/**
 * Per-relay localStorage cache of projected Posts.
 *
 * Each relay id is its own bucket (`nodex.posts.cache:<relayId>`). A post that
 * was seen on multiple relays is stored once in each of its relays' buckets;
 * deduping happens at read time via mergeTasks. Toggling a relay on or off is
 * an O(1) cache-key change instead of rebuilding a combination-keyed entry.
 */

export const POSTS_CACHE_STORAGE_KEY_PREFIX = "nodex.posts.cache:";
export const POSTS_CACHE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const POSTS_CACHE_MAX_POSTS_PER_RELAY = 2000;

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function getStorageKey(relayId: string): string {
  return `${POSTS_CACHE_STORAGE_KEY_PREFIX}${relayId}`;
}

interface SerializedDate {
  __date: string;
}

function isSerializedDate(value: unknown): value is SerializedDate {
  return Boolean(value) && typeof value === "object" && typeof (value as { __date?: unknown }).__date === "string";
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) {
    return { __date: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(inner);
    }
    return out;
  }
  return value;
}

function deserialize(value: unknown): unknown {
  if (isSerializedDate(value)) {
    const parsed = new Date(value.__date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (Array.isArray(value)) {
    return value.map(deserialize);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deserialize(inner);
    }
    return out;
  }
  return value;
}

function hasMinimalPostShape(value: unknown): value is Post {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Post>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.kind === "number" &&
    typeof candidate.content === "string" &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.relays) &&
    candidate.timestamp instanceof Date &&
    Boolean(candidate.author) &&
    typeof (candidate.author as { pubkey?: unknown }).pubkey === "string"
  );
}

function applyRetentionLimits(posts: Post[], nowSeconds = Math.floor(Date.now() / 1000)): Post[] {
  const cutoffMillis = (nowSeconds - POSTS_CACHE_RETENTION_SECONDS) * 1000;
  return posts
    .filter((post) => post.timestamp.getTime() >= cutoffMillis)
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, POSTS_CACHE_MAX_POSTS_PER_RELAY);
}

export function loadCachedPostsForRelay(relayId: string): Post[] {
  if (!hasLocalStorage() || !relayId) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(relayId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const revived = parsed.map((entry) => deserialize(entry));
    const posts = revived.filter(hasMinimalPostShape) as Post[];
    const sanitized = posts.filter((post) => {
      if (!isTaskPost(post)) return true;
      return post.stateUpdates.every((update) => update.timestamp instanceof Date)
        && post.dates.every((date) => date.date instanceof Date);
    });
    return applyRetentionLimits(sanitized);
  } catch {
    return [];
  }
}

export function loadCachedPostsForRelays(relayIds: string[]): Post[] {
  if (relayIds.length === 0) return [];
  return relayIds.reduce<Post[]>(
    (acc, relayId) => mergeTasks(acc, loadCachedPostsForRelay(relayId)),
    [],
  );
}

export function saveCachedPostsForRelay(relayId: string, posts: Post[]): void {
  if (!hasLocalStorage() || !relayId) return;
  const merged = mergeTasks(loadCachedPostsForRelay(relayId), posts);
  const trimmed = applyRetentionLimits(merged);
  try {
    const serialized = serialize(trimmed);
    window.localStorage.setItem(getStorageKey(relayId), JSON.stringify(serialized));
  } catch {
    console.warn("Failed to persist posts cache", {
      relayId,
      postCount: trimmed.length,
    });
  }
}

/**
 * Fans posts out into every relay bucket their `relays` array points to.
 * Posts with no relay attribution are dropped (the wire-boundary check in the
 * router should have caught them earlier; this is defensive).
 */
export function saveCachedPosts(posts: Post[]): void {
  if (!hasLocalStorage() || posts.length === 0) return;
  const byRelay = new Map<string, Post[]>();
  for (const post of posts) {
    for (const relayId of post.relays) {
      if (!relayId) continue;
      const bucket = byRelay.get(relayId);
      if (bucket) bucket.push(post);
      else byRelay.set(relayId, [post]);
    }
  }
  for (const [relayId, bucket] of byRelay) {
    saveCachedPostsForRelay(relayId, bucket);
  }
}

export function clearCachedPostsForRelay(relayId?: string): void {
  if (!hasLocalStorage()) return;
  if (relayId) {
    window.localStorage.removeItem(getStorageKey(relayId));
    return;
  }
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(POSTS_CACHE_STORAGE_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
}
