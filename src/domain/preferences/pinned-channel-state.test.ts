import { describe, expect, it } from "vitest";
import {
  createEmptyPinnedChannelsState,
  getPinnedChannelIdsForRelays,
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
    const state = pinChannelForRelays(emptyState(), [RELAY_A, RELAY_B], "work");
    expect(getPinnedChannelIdsForRelays(state, [RELAY_A])).toContain("work");
    expect(getPinnedChannelIdsForRelays(state, [RELAY_B])).toContain("work");
  });

  it("is idempotent per relay", () => {
    const once = pinChannelForRelays(emptyState(), [RELAY_A], "work");
    const twice = pinChannelForRelays(once, [RELAY_A], "work");
    expect(getPinnedChannelIdsForRelays(twice, [RELAY_A])).toHaveLength(1);
  });

  it("does not mutate the input state", () => {
    const original = emptyState();
    pinChannelForRelays(original, [RELAY_A], "work");
    expect(original.byRelay[RELAY_A]).toBeUndefined();
  });
});

describe("unpinChannelFromRelays", () => {
  it("removes the channel from all specified relays", () => {
    let state = pinChannelForRelays(emptyState(), [RELAY_A, RELAY_B], "work");
    state = unpinChannelFromRelays(state, [RELAY_A, RELAY_B], "work");
    expect(getPinnedChannelIdsForRelays(state, [RELAY_A, RELAY_B])).toHaveLength(0);
  });

  it("does not affect relays not in the list", () => {
    let state = pinChannelForRelays(emptyState(), [RELAY_A, RELAY_C], "work");
    state = unpinChannelFromRelays(state, [RELAY_A], "work");
    expect(getPinnedChannelIdsForRelays(state, [RELAY_C])).toContain("work");
  });
});

describe("getPinnedChannelIdsForRelays", () => {
  it("returns the union of pins across all given relays", () => {
    let state = pinChannelForRelays(emptyState(), [RELAY_A], "work");
    state = pinChannelForRelays(state, [RELAY_B], "urgent");
    expect(getPinnedChannelIdsForRelays(state, [RELAY_A, RELAY_B])).toEqual([
      "urgent",
      "work",
    ]);
  });

  it("orders by minimum order value across relays", () => {
    let state = pinChannelForRelays(emptyState(), [RELAY_A], "b");
    state = pinChannelForRelays(state, [RELAY_A], "a");
    state = pinChannelForRelays(state, [RELAY_B], "c");
    expect(getPinnedChannelIdsForRelays(state, [RELAY_A, RELAY_B])).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("returns empty array when no relay ids are given", () => {
    const state = pinChannelForRelays(emptyState(), [RELAY_A], "work");
    expect(getPinnedChannelIdsForRelays(state, [])).toEqual([]);
  });
});

describe("isChannelPinnedForAnyRelay", () => {
  it("returns true when pinned on at least one relay", () => {
    const state = pinChannelForRelays(emptyState(), [RELAY_A], "work");
    expect(isChannelPinnedForAnyRelay(state, [RELAY_A, RELAY_B], "work")).toBe(true);
  });

  it("returns false when not pinned on the given relays", () => {
    const state = pinChannelForRelays(emptyState(), [RELAY_C], "work");
    expect(isChannelPinnedForAnyRelay(state, [RELAY_A, RELAY_B], "work")).toBe(false);
  });
});
