import type { Post } from "@/types";
import { isTaskPost } from "@/types";

/**
 * Per-scope localStorage cache of projected Posts. Replaces the previous
 * raw-event cache: cold starts now hydrate from already-converted Posts
 * instead of replaying every raw event through the converter.
 *
 * Each scope is identified by the active relay set (the same key the
 * ingestion hook uses). Posts older than the retention window are discarded,
 * and each scope is capped at a fixed count to avoid runaway storage.
 */

export const POSTS_CACHE_STORAGE_KEY_PREFIX = "nodex.posts.cache:";
export const POSTS_CACHE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const POSTS_CACHE_MAX_POSTS_PER_SCOPE = 500;
const EMPTY_SCOPE_KEY = "none";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function getStorageKey(scopeKey: string): string {
  return `${POSTS_CACHE_STORAGE_KEY_PREFIX}${scopeKey}`;
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
    .slice(0, POSTS_CACHE_MAX_POSTS_PER_SCOPE);
}

export function loadCachedPosts(scopeKey: string): Post[] {
  if (!hasLocalStorage() || scopeKey === EMPTY_SCOPE_KEY) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(scopeKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const revived = parsed.map((entry) => deserialize(entry));
    const posts = revived.filter(hasMinimalPostShape) as Post[];
    // Defensive: stateUpdates / dates should also have their Date fields revived;
    // drop entries where revival failed so the converter doesn't choke later.
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

export function saveCachedPosts(scopeKey: string, posts: Post[]): void {
  if (!hasLocalStorage() || scopeKey === EMPTY_SCOPE_KEY) return;
  const trimmed = applyRetentionLimits(posts);
  try {
    const serialized = serialize(trimmed);
    window.localStorage.setItem(getStorageKey(scopeKey), JSON.stringify(serialized));
  } catch {
    console.warn("Failed to persist posts cache", {
      scope: scopeKey,
      postCount: trimmed.length,
    });
  }
}

export function clearCachedPosts(scopeKey?: string): void {
  if (!hasLocalStorage()) return;
  if (scopeKey) {
    window.localStorage.removeItem(getStorageKey(scopeKey));
    return;
  }
  // Sweep all post-cache entries (used when wiping all locally cached state).
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(POSTS_CACHE_STORAGE_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
}
