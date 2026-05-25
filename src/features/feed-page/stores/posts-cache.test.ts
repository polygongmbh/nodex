import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Post, TaskPost } from "@/types";
import {
  POSTS_CACHE_MAX_POSTS,
  POSTS_CACHE_RETENTION_SECONDS,
  POSTS_CACHE_STORAGE_KEY,
  clearCachedPosts,
  loadCachedPosts,
  saveCachedPosts,
} from "./posts-cache";

function task(id: string, timestamp: Date, overrides: Partial<TaskPost> = {}): TaskPost {
  return {
    id,
    kind: NostrEventKind.Task,
    author: { pubkey: "author-pk", name: "author-pk", displayName: "Author" },
    content: `task ${id}`,
    tags: ["alpha"],
    relays: ["relay-a"],
    timestamp,
    stateUpdates: [],
    dates: [],
    assigneePubkeys: [],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("posts-cache", () => {
  it("round-trips a Task post including Date fields", () => {
    const now = new Date();
    const post = task("t1", now, {
      lastEditedAt: new Date(now.getTime() - 60_000),
      stateUpdates: [
        {
          id: "state-1",
          state: { status: "active" },
          timestamp: new Date(now.getTime() - 30_000),
          authorPubkey: "author-pk",
        },
      ],
      dates: [{ date: new Date(now.getTime() + 86_400_000), type: "due" }],
    });
    saveCachedPosts([post]);

    const loaded = loadCachedPosts();
    expect(loaded).toHaveLength(1);
    const revived = loaded[0];
    expect(revived.timestamp.getTime()).toBe(post.timestamp.getTime());
    if (revived.kind !== NostrEventKind.Task) throw new Error("expected task");
    expect(revived.lastEditedAt?.getTime()).toBe(post.lastEditedAt?.getTime());
    expect(revived.stateUpdates[0].timestamp.getTime()).toBe(post.stateUpdates[0].timestamp.getTime());
    expect(revived.dates[0].date.getTime()).toBe(post.dates[0].date.getTime());
  });

  it("returns the empty list when nothing is cached", () => {
    expect(loadCachedPosts()).toEqual([]);
  });

  it("returns the empty list when stored JSON is malformed", () => {
    localStorage.setItem(POSTS_CACHE_STORAGE_KEY, "{not-json");
    expect(loadCachedPosts()).toEqual([]);
  });

  it("returns the empty list when stored payload is not an array", () => {
    localStorage.setItem(POSTS_CACHE_STORAGE_KEY, JSON.stringify({ oops: true }));
    expect(loadCachedPosts()).toEqual([]);
  });

  it("drops entries that lack the minimum Post shape", () => {
    saveCachedPosts([task("good", new Date())]);
    const raw = localStorage.getItem(POSTS_CACHE_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    parsed.push({ wat: true });
    localStorage.setItem(POSTS_CACHE_STORAGE_KEY, JSON.stringify(parsed));

    expect(loadCachedPosts().map((post) => post.id)).toEqual(["good"]);
  });

  it("filters out posts older than the retention window", () => {
    const now = Date.now();
    const recent = task("recent", new Date(now - 60_000));
    const stale = task("stale", new Date(now - (POSTS_CACHE_RETENTION_SECONDS + 10) * 1000));
    saveCachedPosts([stale, recent]);

    expect(loadCachedPosts().map((post) => post.id)).toEqual(["recent"]);
  });

  it("caps stored count and keeps the newest entries", () => {
    const now = Date.now();
    const posts: Post[] = Array.from({ length: POSTS_CACHE_MAX_POSTS + 10 }, (_, index) =>
      task(`t-${index}`, new Date(now - index * 1000)),
    );
    saveCachedPosts(posts);
    const loaded = loadCachedPosts();
    expect(loaded).toHaveLength(POSTS_CACHE_MAX_POSTS);
    expect(loaded[0].id).toBe("t-0");
  });

  it("clearCachedPosts wipes the cache", () => {
    saveCachedPosts([task("a", new Date())]);
    clearCachedPosts();
    expect(loadCachedPosts()).toEqual([]);
  });
});
