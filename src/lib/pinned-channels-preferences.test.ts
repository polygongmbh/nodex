import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
  getPinnedChannelIdsForView,
  isChannelPinnedForView,
  pinChannelForView,
  unpinChannelForView,
  deriveRelaySetKey,
  type PinnedChannelsState,
} from "./pinned-channels-preferences";

const RELAY_A = "relay-a";
const RELAY_B = "relay-b";
const KEY_A = deriveRelaySetKey([RELAY_A]);
const KEY_AB = deriveRelaySetKey([RELAY_A, RELAY_B]);

function emptyState(): PinnedChannelsState {
  return { version: 2, updatedAt: "", byView: {} };
}

beforeEach(() => {
  localStorage.clear();
});

describe("deriveRelaySetKey", () => {
  it("sorts relay IDs for a stable key", () => {
    expect(deriveRelaySetKey([RELAY_B, RELAY_A])).toBe(deriveRelaySetKey([RELAY_A, RELAY_B]));
  });

  it("returns '_' for an empty set", () => {
    expect(deriveRelaySetKey([])).toBe("_");
  });
});

describe("loadPinnedChannelsState", () => {
  it("returns empty state when localStorage is empty", () => {
    expect(loadPinnedChannelsState()).toEqual(emptyState());
  });

  it("returns empty state on corrupt JSON", () => {
    localStorage.setItem("nodex.pinned-channels.guest.v2", "not-json{{{");
    expect(loadPinnedChannelsState()).toEqual(emptyState());
  });

  it("returns empty state on schema mismatch (e.g. v1 data)", () => {
    // v1 shape — should be ignored
    localStorage.setItem(
      "nodex.pinned-channels.guest.v2",
      JSON.stringify({ version: 1, updatedAt: "", byView: {} })
    );
    expect(loadPinnedChannelsState()).toEqual(emptyState());
  });

  it("strips entries with empty channelId", () => {
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: {
        feed: {
          [KEY_A]: [
            { channelId: "valid", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 },
            { channelId: "", pinnedAt: "2026-01-01T00:00:00.000Z", order: 1 },
          ],
        },
      },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v2", JSON.stringify(raw));
    const state = loadPinnedChannelsState();
    expect(getPinnedChannelIdsForView(state, "feed", KEY_A)).toEqual(["valid"]);
  });

  it("uses pubkey prefix for keying", () => {
    const pubkey = "abcdef1234567890";
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: { feed: { [KEY_A]: [{ channelId: "work", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] } },
    };
    localStorage.setItem("nodex.pinned-channels.abcdef12.v2", JSON.stringify(raw));
    const state = loadPinnedChannelsState(pubkey);
    expect(getPinnedChannelIdsForView(state, "feed", KEY_A)).toContain("work");
  });

  it("isolates different users", () => {
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: { feed: { [KEY_A]: [{ channelId: "secret", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] } },
    };
    localStorage.setItem("nodex.pinned-channels.user1111.v2", JSON.stringify(raw));
    const state = loadPinnedChannelsState("user2222xxxx");
    expect(getPinnedChannelIdsForView(state, "feed", KEY_A)).toHaveLength(0);
  });

  it("falls back to guest key when pubkey is absent", () => {
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: { kanban: { [KEY_A]: [{ channelId: "ops", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] } },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v2", JSON.stringify(raw));
    expect(getPinnedChannelIdsForView(loadPinnedChannelsState(undefined), "kanban", KEY_A)).toContain("ops");
  });
});

describe("savePinnedChannelsState", () => {
  it("round-trips correctly", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    savePinnedChannelsState(state);
    const loaded = loadPinnedChannelsState();
    expect(getPinnedChannelIdsForView(loaded, "feed", KEY_A)).toEqual(["work"]);
  });
});

describe("pinChannelForView", () => {
  it("adds a channel to the specified view + relay set", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(state, "feed", KEY_A)).toEqual(["work"]);
  });

  it("does not affect a different relay set on the same view", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(state, "feed", KEY_AB)).toHaveLength(0);
  });

  it("does not affect other views", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(state, "kanban", KEY_A)).toHaveLength(0);
  });

  it("is idempotent when channel is already pinned", () => {
    const s1 = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    const s2 = pinChannelForView(s1, "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(s2, "feed", KEY_A)).toHaveLength(1);
  });

  it("appends subsequent pins at increasing order", () => {
    const s1 = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    const s2 = pinChannelForView(s1, "feed", KEY_A, "urgent");
    expect(getPinnedChannelIdsForView(s2, "feed", KEY_A)).toEqual(["work", "urgent"]);
  });

  it("does not mutate the input state", () => {
    const original = emptyState();
    pinChannelForView(original, "feed", KEY_A, "work");
    expect(original.byView.feed).toBeUndefined();
  });
});

describe("unpinChannelForView", () => {
  it("removes a pinned channel", () => {
    const s1 = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    const s2 = unpinChannelForView(s1, "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(s2, "feed", KEY_A)).toHaveLength(0);
  });

  it("is a no-op when channel is not pinned", () => {
    const s1 = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    const s2 = unpinChannelForView(s1, "feed", KEY_A, "other");
    expect(getPinnedChannelIdsForView(s2, "feed", KEY_A)).toEqual(["work"]);
  });

  it("does not affect a different relay set", () => {
    let state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    state = pinChannelForView(state, "feed", KEY_AB, "work");
    state = unpinChannelForView(state, "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(state, "feed", KEY_AB)).toContain("work");
  });

  it("does not affect other views", () => {
    let state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    state = pinChannelForView(state, "kanban", KEY_A, "work");
    state = unpinChannelForView(state, "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(state, "kanban", KEY_A)).toContain("work");
  });
});

describe("getPinnedChannelIdsForView", () => {
  it("returns IDs in stable order", () => {
    let state = pinChannelForView(emptyState(), "feed", KEY_A, "a");
    state = pinChannelForView(state, "feed", KEY_A, "b");
    state = pinChannelForView(state, "feed", KEY_A, "c");
    expect(getPinnedChannelIdsForView(state, "feed", KEY_A)).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for unknown view", () => {
    expect(getPinnedChannelIdsForView(emptyState(), "nonexistent", KEY_A)).toEqual([]);
  });

  it("returns empty array for unknown relay set key", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(getPinnedChannelIdsForView(state, "feed", KEY_AB)).toEqual([]);
  });
});

describe("isChannelPinnedForView", () => {
  it("returns true for a pinned channel", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(isChannelPinnedForView(state, "feed", KEY_A, "work")).toBe(true);
  });

  it("returns false for an unpinned channel", () => {
    expect(isChannelPinnedForView(emptyState(), "feed", KEY_A, "work")).toBe(false);
  });

  it("returns false for the wrong relay set", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(isChannelPinnedForView(state, "feed", KEY_AB, "work")).toBe(false);
  });

  it("returns false for the wrong view", () => {
    const state = pinChannelForView(emptyState(), "feed", KEY_A, "work");
    expect(isChannelPinnedForView(state, "kanban", KEY_A, "work")).toBe(false);
  });
});
