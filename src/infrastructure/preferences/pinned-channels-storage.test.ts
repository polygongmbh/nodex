import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyPinnedChannelsState,
  getPinnedChannelIdsForRelays,
  pinChannelForRelays,
  type PinnedChannelsState,
} from "@/domain/preferences/pinned-channel-state";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
} from "./pinned-channels-storage";

const RELAY_A = "relay-a";
const RELAY_B = "relay-b";

beforeEach(() => {
  localStorage.clear();
});

describe("loadPinnedChannelsState", () => {
  it("returns empty state when localStorage is empty", () => {
    expect(loadPinnedChannelsState()).toEqual(createEmptyPinnedChannelsState());
  });

  it("returns empty state on corrupt JSON", () => {
    localStorage.setItem("nodex.pinned-channels.guest.v3", "not-json{{{");
    expect(loadPinnedChannelsState()).toEqual(createEmptyPinnedChannelsState());
  });

  it("strips entries with empty channel ids from v3 state", () => {
    const raw: PinnedChannelsState = {
      version: 3,
      updatedAt: "",
      byRelay: {
        [RELAY_A]: [
          { channelId: "valid", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 },
          { channelId: "", pinnedAt: "2026-01-01T00:00:00.000Z", order: 1 },
        ],
      },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v3", JSON.stringify(raw));
    const state = loadPinnedChannelsState();
    expect(getPinnedChannelIdsForRelays(state, [RELAY_A])).toEqual(["valid"]);
  });

  it("migrates legacy v2 view-scoped state into relay-scoped pins", () => {
    const legacyState = {
      version: 2,
      updatedAt: "",
      byView: {
        feed: {
          [RELAY_A]: [{ channelId: "work", pinnedAt: "2026-01-01T00:00:00.000Z", order: 1 }],
        },
        tree: {
          [RELAY_A]: [{ channelId: "ops", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }],
          [RELAY_B]: [{ channelId: "release", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }],
        },
      },
    };
    localStorage.setItem("nodex.pinned-channels.guest.v2", JSON.stringify(legacyState));

    const state = loadPinnedChannelsState();

    expect(getPinnedChannelIdsForRelays(state, [RELAY_A])).toEqual(["ops", "work"]);
    expect(getPinnedChannelIdsForRelays(state, [RELAY_B])).toEqual(["release"]);
  });

  it("uses the pubkey prefix as part of the storage key", () => {
    const pubkey = "abcdef1234567890";
    const raw: PinnedChannelsState = {
      version: 3,
      updatedAt: "",
      byRelay: {
        [RELAY_A]: [{ channelId: "work", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }],
      },
    };
    localStorage.setItem("nodex.pinned-channels.abcdef12.v3", JSON.stringify(raw));
    expect(getPinnedChannelIdsForRelays(loadPinnedChannelsState(pubkey), [RELAY_A])).toEqual([
      "work",
    ]);
  });
});

describe("savePinnedChannelsState", () => {
  it("round-trips persisted state", () => {
    const state = pinChannelForRelays(createEmptyPinnedChannelsState(), [RELAY_A], "work");
    savePinnedChannelsState(state);
    expect(getPinnedChannelIdsForRelays(loadPinnedChannelsState(), [RELAY_A])).toEqual([
      "work",
    ]);
  });
});
