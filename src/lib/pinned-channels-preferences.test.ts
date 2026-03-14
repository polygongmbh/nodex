import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
  getPinnedChannelIdsForView,
  isChannelPinnedForView,
  pinChannelForView,
  unpinChannelForView,
  type PinnedChannelsState,
} from "./pinned-channels-preferences";

function emptyState(): PinnedChannelsState {
  return { version: 1, updatedAt: "", byView: {} };
}

beforeEach(() => {
  localStorage.clear();
});

describe("loadPinnedChannelsState", () => {
  it("returns empty state when localStorage is empty", () => {
    const state = loadPinnedChannelsState();
    expect(state).toEqual(emptyState());
  });

  it("returns empty state on corrupt JSON", () => {
    localStorage.setItem("nodex.pinned-channels.guest.v1", "not-json{{{");
    expect(loadPinnedChannelsState()).toEqual(emptyState());
  });

  it("returns empty state on schema mismatch", () => {
    localStorage.setItem("nodex.pinned-channels.guest.v1", JSON.stringify({ foo: "bar" }));
    expect(loadPinnedChannelsState()).toEqual(emptyState());
  });

  it("strips entries with empty channelId", () => {
    const raw: PinnedChannelsState = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      byView: {
        feed: [
          { channelId: "valid", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 },
          { channelId: "", pinnedAt: "2026-01-01T00:00:00.000Z", order: 1 },
          { channelId: "  ", pinnedAt: "2026-01-01T00:00:00.000Z", order: 2 },
        ],
      },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v1", JSON.stringify(raw));
    const state = loadPinnedChannelsState();
    expect(state.byView.feed).toHaveLength(1);
    expect(state.byView.feed![0].channelId).toBe("valid");
  });

  it("uses pubkey prefix for keying", () => {
    const pubkey = "abcdef1234567890";
    const raw: PinnedChannelsState = {
      version: 1,
      updatedAt: "",
      byView: { feed: [{ channelId: "work", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] },
    };
    localStorage.setItem("nodex.pinned-channels.abcdef12.v1", JSON.stringify(raw));
    const state = loadPinnedChannelsState(pubkey);
    expect(getPinnedChannelIdsForView(state, "feed")).toContain("work");
  });

  it("isolates different users", () => {
    const raw: PinnedChannelsState = {
      version: 1,
      updatedAt: "",
      byView: { feed: [{ channelId: "secret", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] },
    };
    localStorage.setItem("nodex.pinned-channels.user1111.v1", JSON.stringify(raw));
    // Different user should see empty state
    const state = loadPinnedChannelsState("user2222xxxx");
    expect(getPinnedChannelIdsForView(state, "feed")).toHaveLength(0);
  });

  it("falls back to guest key when pubkey is absent", () => {
    const raw: PinnedChannelsState = {
      version: 1,
      updatedAt: "",
      byView: { kanban: [{ channelId: "ops", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v1", JSON.stringify(raw));
    const state = loadPinnedChannelsState(undefined);
    expect(getPinnedChannelIdsForView(state, "kanban")).toContain("ops");
  });
});

describe("savePinnedChannelsState", () => {
  it("round-trips correctly", () => {
    const state = pinChannelForView(emptyState(), "feed", "work");
    savePinnedChannelsState(state);
    const loaded = loadPinnedChannelsState();
    expect(getPinnedChannelIdsForView(loaded, "feed")).toEqual(["work"]);
  });
});

describe("pinChannelForView", () => {
  it("adds a channel to the specified view", () => {
    const state = pinChannelForView(emptyState(), "feed", "work");
    expect(getPinnedChannelIdsForView(state, "feed")).toEqual(["work"]);
  });

  it("does not affect other views", () => {
    const state = pinChannelForView(emptyState(), "feed", "work");
    expect(getPinnedChannelIdsForView(state, "kanban")).toHaveLength(0);
  });

  it("is idempotent when channel is already pinned", () => {
    const s1 = pinChannelForView(emptyState(), "feed", "work");
    const s2 = pinChannelForView(s1, "feed", "work");
    expect(getPinnedChannelIdsForView(s2, "feed")).toHaveLength(1);
  });

  it("appends subsequent pins at increasing order", () => {
    const s1 = pinChannelForView(emptyState(), "feed", "work");
    const s2 = pinChannelForView(s1, "feed", "urgent");
    expect(getPinnedChannelIdsForView(s2, "feed")).toEqual(["work", "urgent"]);
  });

  it("does not mutate the input state", () => {
    const original = emptyState();
    pinChannelForView(original, "feed", "work");
    expect(original.byView.feed).toBeUndefined();
  });
});

describe("unpinChannelForView", () => {
  it("removes a pinned channel", () => {
    const s1 = pinChannelForView(emptyState(), "feed", "work");
    const s2 = unpinChannelForView(s1, "feed", "work");
    expect(getPinnedChannelIdsForView(s2, "feed")).toHaveLength(0);
  });

  it("is a no-op when channel is not pinned", () => {
    const s1 = pinChannelForView(emptyState(), "feed", "work");
    const s2 = unpinChannelForView(s1, "feed", "other");
    expect(getPinnedChannelIdsForView(s2, "feed")).toEqual(["work"]);
  });

  it("does not affect other views", () => {
    let state = pinChannelForView(emptyState(), "feed", "work");
    state = pinChannelForView(state, "kanban", "work");
    state = unpinChannelForView(state, "feed", "work");
    expect(getPinnedChannelIdsForView(state, "kanban")).toContain("work");
  });
});

describe("getPinnedChannelIdsForView", () => {
  it("returns IDs in stable order", () => {
    let state = pinChannelForView(emptyState(), "feed", "a");
    state = pinChannelForView(state, "feed", "b");
    state = pinChannelForView(state, "feed", "c");
    expect(getPinnedChannelIdsForView(state, "feed")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for unknown view", () => {
    expect(getPinnedChannelIdsForView(emptyState(), "nonexistent")).toEqual([]);
  });
});

describe("isChannelPinnedForView", () => {
  it("returns true for a pinned channel", () => {
    const state = pinChannelForView(emptyState(), "feed", "work");
    expect(isChannelPinnedForView(state, "feed", "work")).toBe(true);
  });

  it("returns false for an unpinned channel", () => {
    expect(isChannelPinnedForView(emptyState(), "feed", "work")).toBe(false);
  });

  it("returns false for the wrong view", () => {
    const state = pinChannelForView(emptyState(), "feed", "work");
    expect(isChannelPinnedForView(state, "kanban", "work")).toBe(false);
  });
});
