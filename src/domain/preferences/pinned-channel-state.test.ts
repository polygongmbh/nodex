import { describe, expect, it } from "vitest";
import {
  createEmptyPinnedChannelsState,
  getPinnedChannelIdsForView,
  isChannelPinnedForAnyRelay,
  pinChannelForRelays,
  unpinChannelFromRelays,
  type PinnedChannelsState,
} from "./pinned-channel-state";

const RELAY_A = "relay-a";
const RELAY_B = "relay-b";
const RELAY_C = "relay-c";

function emptyState(): PinnedChannelsState {
  return createEmptyPinnedChannelsState();
}

describe("pinChannelForRelays", () => {
  it("adds a channel to each specified relay", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A, RELAY_B], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A])).toContain("work");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_B])).toContain("work");
  });

  it("is idempotent per relay", () => {
    const once = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    const twice = pinChannelForRelays(once, "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(twice, "feed", [RELAY_A])).toHaveLength(1);
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
});

describe("getPinnedChannelIdsForView", () => {
  it("returns the union of pins across all given relays", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    state = pinChannelForRelays(state, "feed", [RELAY_B], "urgent");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A, RELAY_B])).toEqual([
      "urgent",
      "work",
    ]);
  });

  it("orders by minimum order value across relays", () => {
    let state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "b");
    state = pinChannelForRelays(state, "feed", [RELAY_A], "a");
    state = pinChannelForRelays(state, "feed", [RELAY_B], "c");
    expect(getPinnedChannelIdsForView(state, "feed", [RELAY_A, RELAY_B])).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("returns empty array when no relay ids are given", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(getPinnedChannelIdsForView(state, "feed", [])).toEqual([]);
  });
});

describe("isChannelPinnedForAnyRelay", () => {
  it("returns true when pinned on at least one relay", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_A], "work");
    expect(isChannelPinnedForAnyRelay(state, "feed", [RELAY_A, RELAY_B], "work")).toBe(true);
  });

  it("returns false when not pinned on the given relays", () => {
    const state = pinChannelForRelays(emptyState(), "feed", [RELAY_C], "work");
    expect(isChannelPinnedForAnyRelay(state, "feed", [RELAY_A, RELAY_B], "work")).toBe(false);
  });
});
