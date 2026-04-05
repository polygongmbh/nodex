import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";
import {
  createEmptyPinnedChannelsState,
  getPinnedChannelIdsForRelays,
  pinChannelForRelays,
  unpinChannelFromRelays,
} from "@/domain/preferences/pinned-channel-state";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
} from "@/infrastructure/preferences/pinned-channels-storage";

function makeOptions(overrides: {
  userPubkey?: string;
  effectiveActiveRelayIds?: Set<string>;
  entityRelayIds?: Map<string, Set<string>>;
} = {}) {
  return {
    userPubkey: overrides.userPubkey,
    effectiveActiveRelayIds: overrides.effectiveActiveRelayIds ?? new Set(["relay-one"]),
    entityRelayIds: overrides.entityRelayIds ?? new Map(),
    loadState: loadPinnedChannelsState,
    saveState: savePinnedChannelsState,
    getPinnedIds: getPinnedChannelIdsForRelays,
    pinForRelays: pinChannelForRelays,
    unpinFromRelays: unpinChannelFromRelays,
  };
}

describe("usePinnedSidebarEntityState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("initializes state from storage", () => {
    const preloaded = pinChannelForRelays(createEmptyPinnedChannelsState(), ["relay-one"], "ops");
    savePinnedChannelsState(preloaded);

    const { result } = renderHook(() => usePinnedSidebarEntityState(makeOptions()));

    expect(result.current.pinnedIds).toContain("ops");
  });

  it("reloads state when userPubkey changes", () => {
    const guestState = pinChannelForRelays(createEmptyPinnedChannelsState(), ["relay-one"], "guest-ch");
    savePinnedChannelsState(guestState, undefined);

    const userState = pinChannelForRelays(createEmptyPinnedChannelsState(), ["relay-one"], "user-ch");
    savePinnedChannelsState(userState, "abc123");

    const { result, rerender } = renderHook(
      ({ pubkey }) => usePinnedSidebarEntityState(makeOptions({ userPubkey: pubkey })),
      { initialProps: { pubkey: undefined as string | undefined } }
    );

    expect(result.current.pinnedIds).toContain("guest-ch");

    rerender({ pubkey: "abc123" });
    expect(result.current.pinnedIds).toContain("user-ch");
    expect(result.current.pinnedIds).not.toContain("guest-ch");
  });

  it("persists state to storage when pinning", () => {
    const { result } = renderHook(() =>
      usePinnedSidebarEntityState(makeOptions())
    );

    act(() => {
      result.current.pinAcrossRelays("general");
    });

    const saved = loadPinnedChannelsState(undefined);
    expect(getPinnedChannelIdsForRelays(saved, ["relay-one"])).toContain("general");
  });

  it("pins only to the relays where the entity is present", () => {
    const entityRelayIds = new Map([
      ["ops", new Set(["relay-two"])],
    ]);

    const { result } = renderHook(() =>
      usePinnedSidebarEntityState(makeOptions({
        effectiveActiveRelayIds: new Set(["relay-one", "relay-two"]),
        entityRelayIds,
      }))
    );

    act(() => {
      result.current.pinAcrossRelays("ops");
    });

    const saved = loadPinnedChannelsState(undefined);
    expect(getPinnedChannelIdsForRelays(saved, ["relay-two"])).toContain("ops");
    expect(getPinnedChannelIdsForRelays(saved, ["relay-one"])).not.toContain("ops");
  });

  it("falls back to all active relays when entity has no relay presence", () => {
    const { result } = renderHook(() =>
      usePinnedSidebarEntityState(makeOptions({
        effectiveActiveRelayIds: new Set(["relay-one", "relay-two"]),
        entityRelayIds: new Map(),
      }))
    );

    act(() => {
      result.current.pinAcrossRelays("unknown-channel");
    });

    const saved = loadPinnedChannelsState(undefined);
    const pinned = getPinnedChannelIdsForRelays(saved, ["relay-one", "relay-two"]);
    expect(pinned).toContain("unknown-channel");
  });

  it("unpins from all active relays", () => {
    const initial = pinChannelForRelays(
      pinChannelForRelays(createEmptyPinnedChannelsState(), ["relay-one"], "ops"),
      ["relay-two"], "ops"
    );
    savePinnedChannelsState(initial);

    const { result } = renderHook(() =>
      usePinnedSidebarEntityState(makeOptions({
        effectiveActiveRelayIds: new Set(["relay-one", "relay-two"]),
      }))
    );

    act(() => {
      result.current.unpinAcrossRelays("ops");
    });

    expect(result.current.pinnedIds).not.toContain("ops");
  });
});
