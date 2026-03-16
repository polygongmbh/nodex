import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
  getPinnedChannelIdsForView,
  isChannelPinnedForAnyRelay,
  pinChannelForRelays,
  unpinChannelFromRelays,
  type PinnedChannelsState,
} from "./pinned-channels-preferences";

const RELAY_A = "relay-a";
const RELAY_B = "relay-b";
const RELAY_C = "relay-c";

function emptyState(): PinnedChannelsState {
  return { version: 2, updatedAt: "", byView: {} };
}

beforeEach(() => {
  localStorage.clear();
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
          [RELAY_A]: [
            { channelId: "valid", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 },
            { channelId: "", pinnedAt: "2026-01-01T00:00:00.000Z", order: 1 },
          ],
        },
      },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v2", JSON.stringify(raw));
    const state = loadPinnedChannelsState();
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A])).toEqual(["valid"]);
  });

  it("uses pubkey prefix for keying", () => {
    const pubkey = "abcdef1234567890";
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: { feed: { [RELAY_A]: [{ channelId: "work", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] } },
    };
    localStorage.setItem("nodex.pinned-channels.abcdef12.v2", JSON.stringify(raw));
    const state = loadPinnedChannelsState(pubkey);
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A])).toContain("work");
  });

  it("isolates different users", () => {
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: { feed: { [RELAY_A]: [{ channelId: "secret", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] } },
    };
    localStorage.setItem("nodex.pinned-channels.user1111.v2", JSON.stringify(raw));
    const state = loadPinnedChannelsState("user2222xxxx");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A])).toHaveLength(0);
  });

  it("falls back to guest key when pubkey is absent", () => {
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: { kanban: { [RELAY_A]: [{ channelId: "ops", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }] } },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v2", JSON.stringify(raw));
    expect(getPinnedChannelIdsForView(loadPinnedChannelsState(undefined), "kanban", [RELAY_A])).toContain("ops");
  });
});

describe("savePinnedChannelsState", () => {
  it("round-trips correctly", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    savePinnedChannelsState(state);
    expect(getPinnedChannelIdsForView(loadPinnedChannelsState(), "feed", [RELAY_A])).toEqual(["work"]);
  });
});

describe("pinChannelForRelays", () => {
  it("adds a channel to each specified relay", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A, RELAY_B], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A])).toContain("work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_B])).toContain("work");
  });

  it("does not affect relays not in the list", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_B])).toHaveLength(0);
  });

  it("does not affect other views", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(state, "kanban", [RELAY_A])).toHaveLength(0);
  });

  it("is idempotent per relay", () => {
    const s1 = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    const s2 = pinChannelForRelays(s1, "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(s2, "feed", [RELAY_A])).toHaveLength(1);
  });

  it("appends subsequent pins at increasing order", () => {
    const s1 = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    const s2 = pinChannelForRelays(s1, "feed", [RELAY_A], "urgent");
    expect(getPinnedChannelIdsForView(s2, "feed", [RELAY_A])).toEqual(["work", "urgent"]);
  });

  it("does not mutate the input state", () => {
    const original = emptyState();
    pinChannelForRelays(original, "feed", [RELAY_A], "work");
    expect(original.byView.feed).toBeUndefined();
  });
});

describe("unpinChannelFromRelays", () => {
  it("removes the channel from all specified relays", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A, RELAY_B], "work");
    state = unpinChannelFromRelays(state, "feed", [RELAY_A, RELAY_B], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A, RELAY_B])).toHaveLength(0);
  });

  it("does not affect relays not in the list", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A, RELAY_C], "work");
    state = unpinChannelFromRelays(state, "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_C])).toContain("work");
  });

  it("is a no-op when channel is not pinned", () => {
    const s1 = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    const s2 = unpinChannelFromRelays(s1, "feed", [RELAY_A], "other");
    expect(getPinnedChannelIdsForView(s2, "feed", [RELAY_A])).toEqual(["work"]);
  });
});

describe("getPinnedChannelIdsForView (multi-relay union)", () => {
  it("returns the union of pins across all given relays", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    state = pinChannelForRelays(state, "feed", [RELAY_B], "urgent");
    const ids = getPinnedChannelIdsForView(state, "feed", [RELAY_A, RELAY_B]);
    expect(ids).toContain("work");
    expect(ids).toContain("urgent");
  });

  it("deduplicates channels pinned on multiple relays", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A, RELAY_B], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A, RELAY_B])).toEqual(["work"]);
  });

  it("orders by minimum order value across relays", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "b");
    state = pinChannelForRelays(state, "feed", [RELAY_A], "a");
    state = pinChannelForRelays(state, "feed", [RELAY_B], "c");
    // relay-a: b=0, a=1 / relay-b: c=0
    // union order: b(min=0), c(min=0, alpha after b), a(min=1)
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A, RELAY_B])).toEqual(["b", "c", "a"]);
  });

  it("returns empty array for an unknown view", () => {
    expect(getPinnedChannelIdsForView(emptyState(), "nonexistent", [RELAY_A])).toEqual([]);
  });

  it("returns empty array when no relay IDs are given", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [])).toEqual([]);
  });
});

describe("isChannelPinnedForAnyRelay", () => {
  it("returns true when pinned on at least one of the given relays", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(isChannelPinnedForAnyRelay(state, "feed", [RELAY_A, RELAY_B], "work")).toBe(true);
  });

  it("returns false when not pinned on any of the given relays", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_C], "work");
    expect(isChannelPinnedForAnyRelay(state, "feed", [RELAY_A, RELAY_B], "work")).toBe(false);
  });

  it("returns false for the wrong view", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(isChannelPinnedForAnyRelay(state, "kanban", [RELAY_A], "work")).toBe(false);
  });
});
