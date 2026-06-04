import type { Post } from "@/types";
import { isTaskPost } from "@/types";

/**
 * Single-blob localStorage cache of projected Posts for cold-start hydration.
 * Written infrequently (on visibilitychange-hidden and unmount); read once at
 * mount. Relay scoping happens downstream in the derived-data layer, so this
 * file does not partition or filter by relay.
 */

export const POSTS_CACHE_STORAGE_KEY = "nodex.posts.cache.v2";
export const POSTS_CACHE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const POSTS_CACHE_MAX_POSTS = 5000;

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

interface SerializedDate {
  __date: string;
}

function isSerializedDate(value: unknown): value is SerializedDate {
  return Boolean(value) && typeof value === "object" && typeof (value as { __date?: unknown }).__date === "string";
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(inner);
    }
    return out;
  }
  return value;
}

// Mutates the JSON.parse output in place — the caller owns it and discards
// any stale references after this returns. Avoids rebuilding the whole tree
// (one fresh array + one fresh object per nested level) just to revive Dates,
// which dominated cold-start allocations.
function deserialize(value: unknown): unknown {
  if (isSerializedDate(value)) {
    const parsed = new Date(value.__date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const next = deserialize(value[i]);
      if (next !== value[i]) value[i] = next;
    }
    return value;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const next = deserialize(obj[key]);
      if (next !== obj[key]) obj[key] = next;
    }
    return obj;
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
    .slice(0, POSTS_CACHE_MAX_POSTS);
}

export function loadCachedPosts(): Post[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(POSTS_CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    for (let i = 0; i < parsed.length; i++) {
      parsed[i] = deserialize(parsed[i]);
    }
    const posts = parsed.filter(hasMinimalPostShape) as Post[];
    const sanitized = posts.filter((post) => {
      if (!isTaskPost(post)) return true;
      return post.stateUpdates.every((update) => update.timestamp instanceof Date)
        && post.dates.every((entry) =>
          "datetime" in entry
            ? entry.datetime instanceof Date
            : typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        );
    });
    return applyRetentionLimits(sanitized);
  } catch {
    return [];
  }
}

export function saveCachedPosts(posts: Post[]): void {
  if (!hasLocalStorage()) return;
  const trimmed = applyRetentionLimits(posts);
  try {
    window.localStorage.setItem(POSTS_CACHE_STORAGE_KEY, JSON.stringify(serialize(trimmed)));
  } catch (error) {
    console.warn("Failed to persist posts cache", { postCount: trimmed.length, error });
  }
}

export function clearCachedPosts(): void {
  if (!hasLocalStorage()) return;
  window.localStorage.removeItem(POSTS_CACHE_STORAGE_KEY);
}
