import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Post, TaskPost } from "@/types";
import {
  POSTS_CACHE_MAX_POSTS_PER_RELAY,
  POSTS_CACHE_RETENTION_SECONDS,
  POSTS_CACHE_STORAGE_KEY_PREFIX,
  clearCachedPostsForRelay,
  loadCachedPostsForRelay,
  loadCachedPostsForRelays,
  saveCachedPosts,
  saveCachedPostsForRelay,
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

describe("posts-cache (per-relay)", () => {
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
    saveCachedPostsForRelay("relay-a", [post]);

    const loaded = loadCachedPostsForRelay("relay-a");
    expect(loaded).toHaveLength(1);
    const revived = loaded[0];
    expect(revived.timestamp.getTime()).toBe(post.timestamp.getTime());
    if (revived.kind !== NostrEventKind.Task) throw new Error("expected task");
    expect(revived.lastEditedAt?.getTime()).toBe(post.lastEditedAt?.getTime());
    expect(revived.stateUpdates[0].timestamp.getTime()).toBe(post.stateUpdates[0].timestamp.getTime());
    expect(revived.dates[0].date.getTime()).toBe(post.dates[0].date.getTime());
  });

  it("returns the empty list for a missing relay bucket", () => {
    expect(loadCachedPostsForRelay("relay-a")).toEqual([]);
  });

  it("returns the empty list when stored JSON is malformed", () => {
    localStorage.setItem(`${POSTS_CACHE_STORAGE_KEY_PREFIX}relay-a`, "{not-json");
    expect(loadCachedPostsForRelay("relay-a")).toEqual([]);
  });

  it("returns the empty list when stored payload is not an array", () => {
    localStorage.setItem(`${POSTS_CACHE_STORAGE_KEY_PREFIX}relay-a`, JSON.stringify({ oops: true }));
    expect(loadCachedPostsForRelay("relay-a")).toEqual([]);
  });

  it("drops entries that lack the minimum Post shape", () => {
    saveCachedPostsForRelay("relay-a", [task("good", new Date())]);
    const raw = localStorage.getItem(`${POSTS_CACHE_STORAGE_KEY_PREFIX}relay-a`);
    const parsed = JSON.parse(raw!);
    parsed.push({ wat: true });
    localStorage.setItem(`${POSTS_CACHE_STORAGE_KEY_PREFIX}relay-a`, JSON.stringify(parsed));

    const loaded = loadCachedPostsForRelay("relay-a");
    expect(loaded.map((post) => post.id)).toEqual(["good"]);
  });

  it("filters out posts older than the retention window", () => {
    const now = Date.now();
    const recent = task("recent", new Date(now - 60_000));
    const stale = task("stale", new Date(now - (POSTS_CACHE_RETENTION_SECONDS + 10) * 1000));
    saveCachedPostsForRelay("relay-a", [stale, recent]);

    const loaded = loadCachedPostsForRelay("relay-a");
    expect(loaded.map((post) => post.id)).toEqual(["recent"]);
  });

  it("caps stored count per bucket and keeps the newest entries", () => {
    const now = Date.now();
    const posts: Post[] = Array.from({ length: POSTS_CACHE_MAX_POSTS_PER_RELAY + 10 }, (_, index) =>
      task(`t-${index}`, new Date(now - index * 1000)),
    );
    saveCachedPostsForRelay("relay-a", posts);
    const loaded = loadCachedPostsForRelay("relay-a");
    expect(loaded).toHaveLength(POSTS_CACHE_MAX_POSTS_PER_RELAY);
    expect(loaded[0].id).toBe("t-0");
  });

  it("isolates buckets per relay", () => {
    saveCachedPostsForRelay("relay-a", [task("a", new Date(), { relays: ["relay-a"] })]);
    saveCachedPostsForRelay("relay-b", [task("b", new Date(), { relays: ["relay-b"] })]);
    expect(loadCachedPostsForRelay("relay-a").map((post) => post.id)).toEqual(["a"]);
    expect(loadCachedPostsForRelay("relay-b").map((post) => post.id)).toEqual(["b"]);
  });

  it("rejects writes with empty relayId", () => {
    saveCachedPostsForRelay("", [task("a", new Date())]);
    expect(localStorage.length).toBe(0);
  });

  it("merges new posts into an existing bucket via mergeTasks rather than overwriting", () => {
    const t0 = new Date();
    saveCachedPostsForRelay("relay-a", [task("a", t0, { relays: ["relay-a"] })]);
    saveCachedPostsForRelay("relay-a", [task("b", t0, { relays: ["relay-a"] })]);
    const loaded = loadCachedPostsForRelay("relay-a").map((post) => post.id).sort();
    expect(loaded).toEqual(["a", "b"]);
  });

  it("merging keeps the latest-timestamp version and unions relays per post id", () => {
    const now = Date.now();
    const earlier = new Date(now - 60_000);
    const later = new Date(now - 30_000);
    saveCachedPostsForRelay("relay-a", [
      task("shared", earlier, { content: "old", relays: ["relay-a"] }),
    ]);
    saveCachedPostsForRelay("relay-a", [
      task("shared", later, { content: "new", relays: ["relay-a", "relay-b"] }),
    ]);
    const loaded = loadCachedPostsForRelay("relay-a");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe("new");
    expect([...loaded[0].relays].sort()).toEqual(["relay-a", "relay-b"]);
  });

  describe("saveCachedPosts (fan-out)", () => {
    it("writes each post into every bucket in its relays array", () => {
      const post = task("multi", new Date(), { relays: ["relay-a", "relay-b"] });
      saveCachedPosts([post]);
      expect(loadCachedPostsForRelay("relay-a").map((p) => p.id)).toEqual(["multi"]);
      expect(loadCachedPostsForRelay("relay-b").map((p) => p.id)).toEqual(["multi"]);
    });

    it("skips posts with no relays", () => {
      const post = task("orphan", new Date(), { relays: [] });
      saveCachedPosts([post]);
      expect(localStorage.length).toBe(0);
    });

    it("groups multiple posts into the right buckets in one pass", () => {
      const now = new Date();
      const onlyA = task("only-a", now, { relays: ["relay-a"] });
      const onlyB = task("only-b", now, { relays: ["relay-b"] });
      const both = task("both", now, { relays: ["relay-a", "relay-b"] });
      saveCachedPosts([onlyA, onlyB, both]);
      expect(loadCachedPostsForRelay("relay-a").map((p) => p.id).sort()).toEqual(["both", "only-a"]);
      expect(loadCachedPostsForRelay("relay-b").map((p) => p.id).sort()).toEqual(["both", "only-b"]);
    });
  });

  describe("loadCachedPostsForRelays (union)", () => {
    it("unions buckets and dedupes posts seen on multiple relays", () => {
      const now = new Date();
      saveCachedPostsForRelay("relay-a", [task("shared", now, { relays: ["relay-a"] })]);
      saveCachedPostsForRelay("relay-b", [task("shared", now, { relays: ["relay-b"] })]);
      const loaded = loadCachedPostsForRelays(["relay-a", "relay-b"]);
      expect(loaded).toHaveLength(1);
      expect([...loaded[0].relays].sort()).toEqual(["relay-a", "relay-b"]);
    });

    it("returns an empty list when no relayIds are given", () => {
      saveCachedPostsForRelay("relay-a", [task("a", new Date())]);
      expect(loadCachedPostsForRelays([])).toEqual([]);
    });
  });

  describe("clearCachedPostsForRelay", () => {
    it("wipes a single bucket when one is provided", () => {
      saveCachedPostsForRelay("relay-a", [task("a", new Date())]);
      saveCachedPostsForRelay("relay-b", [task("b", new Date())]);
      clearCachedPostsForRelay("relay-a");
      expect(loadCachedPostsForRelay("relay-a")).toEqual([]);
      expect(loadCachedPostsForRelay("relay-b")).toHaveLength(1);
    });

    it("sweeps every post-cache bucket when called with no argument", () => {
      saveCachedPostsForRelay("relay-a", [task("a", new Date())]);
      saveCachedPostsForRelay("relay-b", [task("b", new Date())]);
      clearCachedPostsForRelay();
      expect(loadCachedPostsForRelay("relay-a")).toEqual([]);
      expect(loadCachedPostsForRelay("relay-b")).toEqual([]);
    });
  });
});
