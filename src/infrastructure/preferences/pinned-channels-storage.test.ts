import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyPinnedChannelsState,
  getPinnedChannelIdsForView,
  pinChannelForRelays,
  type PinnedChannelsState,
} from "@/domain/preferences/pinned-channel-state";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
} from "./pinned-channels-storage";

const RELAY_A = "relay-a";

beforeEach(() => {
  localStorage.clear();
});

describe("loadPinnedChannelsState", () => {
  it("returns empty state when localStorage is empty", () => {
    expect(loadPinnedChannelsState()).toEqual(createEmptyPinnedChannelsState());
  });

  it("returns empty state on corrupt JSON", () => {
    localStorage.setItem("nodex.pinned-channels.guest.v2", "not-json{{{");
    expect(loadPinnedChannelsState()).toEqual(createEmptyPinnedChannelsState());
  });

  it("strips entries with empty channel ids", () => {
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

  it("uses the pubkey prefix as part of the storage key", () => {
    const pubkey = "abcdef1234567890";
    const raw: PinnedChannelsState = {
      version: 2,
      updatedAt: "",
      byView: {
        feed: {
          [RELAY_A]: [{ channelId: "work", pinnedAt: "2026-01-01T00:00:00.000Z", order: 0 }],
        },
      },
    };
    localStorage.setItem("nodex.pinned-channels.abcdef12.v2", JSON.stringify(raw));
    expect(getPinnedChannelIdsForView(loadPinnedChannelsState(pubkey), "feed", [RELAY_A])).toEqual([
      "work",
    ]);
  });
});

describe("savePinnedChannelsState", () => {
  it("round-trips persisted state", () => {
    const state = pinChannelForRelays(createEmptyPinnedChannelsState(), "feed", [RELAY_A], "work");
    savePinnedChannelsState(state);
    expect(getPinnedChannelIdsForView(loadPinnedChannelsState(), "feed", [RELAY_A])).toEqual([
      "work",
    ]);
  });
});
