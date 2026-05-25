import { describe, it, expect, beforeEach } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Post, TaskPost } from "@/types";
import { makePerson } from "@/test/fixtures";
import {
  applyDateUpdate,
  applyDeletion,
  applyPriorityUpdate,
  applyStateUpdate,
  ingestPost,
  getPosts,
  getPostIdByReplaceableKey,
  setPostsSuppression,
  __resetPostsStoreForTests,
} from "./posts-store";

function makeTaskPost(overrides: Partial<TaskPost> = {}): TaskPost {
  const author = overrides.author ?? makePerson({ pubkey: "a".repeat(64) });
  return {
    id: "task-1",
    kind: NostrEventKind.Task,
    author,
    content: "#ops do the thing",
    tags: ["ops"],
    relays: ["relay-a"],
    timestamp: new Date("2026-05-01T00:00:00Z"),
    stateUpdates: [],
    dates: [],
    assigneePubkeys: [],
    mentions: [],
    ...overrides,
  };
}

describe("posts-store", () => {
  beforeEach(() => {
    __resetPostsStoreForTests();
  });

  it("ingests a Post and exposes it via getPosts", () => {
    ingestPost({ post: makeTaskPost({ id: "task-a" }) });
    const posts = getPosts();
    expect(posts.map((p) => p.id)).toEqual(["task-a"]);
  });

  it("folds a state update into an existing Post", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    ingestPost({ post: makeTaskPost({ id: "task-a", author }) });
    applyStateUpdate({
      targetId: "task-a",
      updateId: "state-1",
      newState: "done",
      authorPubkey: author.pubkey,
      timestampMs: Date.now(),
    });
    const [post] = getPosts() as TaskPost[];
    expect(post.stateUpdates).toHaveLength(1);
    expect(post.stateUpdates[0].state).toBe("done");
  });

  it("buffers a state update arriving before its target Post and replays on ingest", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    applyStateUpdate({
      targetId: "task-late",
      updateId: "state-1",
      newState: "done",
      authorPubkey: author.pubkey,
      timestampMs: Date.now(),
    });

    expect(getPosts()).toHaveLength(0);

    ingestPost({ post: makeTaskPost({ id: "task-late", author }) });
    const [post] = getPosts() as TaskPost[];
    expect(post.stateUpdates).toHaveLength(1);
    expect(post.stateUpdates[0].state).toBe("done");
  });

  it("applies a deletion targeting an existing Post and rejects subsequent re-ingest by the same author", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    ingestPost({ post: makeTaskPost({ id: "task-doomed", author }) });
    applyDeletion({ targetIds: ["task-doomed"], byPubkey: author.pubkey });

    expect(getPosts()).toHaveLength(0);

    const replayAccepted = ingestPost({ post: makeTaskPost({ id: "task-doomed", author }) });
    expect(replayAccepted).toBe(false);
    expect(getPosts()).toHaveLength(0);
  });

  it("ignores a deletion from a different author than the post owner", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    ingestPost({ post: makeTaskPost({ id: "task-x", author }) });
    applyDeletion({ targetIds: ["task-x"], byPubkey: "b".repeat(64) });
    expect(getPosts().map((p) => p.id)).toEqual(["task-x"]);
  });

  it("filters out suppressed event ids when projecting", () => {
    ingestPost({ post: makeTaskPost({ id: "keep" }) });
    ingestPost({ post: makeTaskPost({ id: "drop" }) });

    setPostsSuppression(new Set(["drop"]));
    expect(getPosts().map((p) => p.id).sort()).toEqual(["keep"]);

    setPostsSuppression(new Set());
    expect(getPosts().map((p) => p.id).sort()).toEqual(["drop", "keep"]);
  });

  it("clears the replaceable-key mapping when a Post is deleted, allowing a fresh re-publish", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    const key = "31923:author:slug";
    ingestPost({
      post: makeTaskPost({ id: "cal-1", author, timestamp: new Date("2026-04-01") }),
      replaceableKey: key,
    });
    expect(getPostIdByReplaceableKey(key)).toBe("cal-1");

    applyDeletion({ targetIds: ["cal-1"], byPubkey: author.pubkey });
    expect(getPostIdByReplaceableKey(key)).toBeUndefined();

    // Fresh re-publish with same address, different id and newer timestamp
    // — must be accepted (no stale id pinning the address).
    const accepted = ingestPost({
      post: makeTaskPost({ id: "cal-2", author, timestamp: new Date("2026-05-01") }),
      replaceableKey: key,
    });
    expect(accepted).toBe(true);
    expect(getPosts().map((p) => p.id)).toEqual(["cal-2"]);
    expect(getPostIdByReplaceableKey(key)).toBe("cal-2");
  });

  it("replaces a replaceable Post when a newer one with the same key arrives", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    const oldPost = makeTaskPost({
      id: "listing-old",
      author,
      timestamp: new Date("2026-04-01"),
    });
    const newPost = makeTaskPost({
      id: "listing-new",
      author,
      timestamp: new Date("2026-05-01"),
    });
    ingestPost({ post: oldPost, replaceableKey: "30402:author:slug" });
    ingestPost({ post: newPost, replaceableKey: "30402:author:slug" });
    expect(getPosts().map((p) => p.id)).toEqual(["listing-new"]);
  });

  it("applies a priority update incrementally", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    ingestPost({ post: makeTaskPost({ id: "task-prio", author }) });
    applyPriorityUpdate({
      targetId: "task-prio",
      authorPubkey: author.pubkey,
      priority: 7,
      timestampMs: Date.now(),
    });
    const [post] = getPosts() as TaskPost[];
    expect(post.priority).toBe(7);
  });

  it("applies a date update incrementally", () => {
    const author = makePerson({ pubkey: "a".repeat(64) });
    ingestPost({ post: makeTaskPost({ id: "task-date", author }) });
    applyDateUpdate({
      targetId: "task-date",
      authorPubkey: author.pubkey,
      type: "due",
      date: new Date("2026-06-15T00:00:00Z"),
      timestampMs: Date.now(),
    });
    const [post] = getPosts() as TaskPost[];
    expect(post.dates).toHaveLength(1);
    expect(post.dates[0].type).toBe("due");
  });
});
