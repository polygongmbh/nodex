import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";
import {
  createEmptyPinnedEntityState,
  getPinnedEntityIdsForRelays,
  pinEntityForRelays,
} from "@/domain/preferences/pinned-entity-state";
import {
  loadPinnedEntityState,
  savePinnedEntityState,
} from "@/infrastructure/preferences/pinned-entity-storage";

const NS = "pinned-channels";
const IK = "channelId" as const;

function loadState(pubkey?: string) {
  return loadPinnedEntityState({ namespace: NS, idKey: IK, pubkey, createEmptyState: createEmptyPinnedEntityState });
}
function saveState(state: ReturnType<typeof loadState>, pubkey?: string) {
  savePinnedEntityState({ namespace: NS, state, pubkey });
}

function makeOptions(overrides: {
  userPubkey?: string;
  effectiveActiveRelayIds?: Set<string>;
  entityRelayIds?: Map<string, Set<string>>;
} = {}) {
  return {
    userPubkey: overrides.userPubkey,
    effectiveActiveRelayIds: overrides.effectiveActiveRelayIds ?? new Set(["relay-one"]),
    entityRelayIds: overrides.entityRelayIds ?? new Map(),
    namespace: NS,
    idKey: IK,
  };
}

describe("usePinnedSidebarEntityState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("initializes state from storage", () => {
    const preloaded = pinEntityForRelays(createEmptyPinnedEntityState(), ["relay-one"], "ops", IK);
    saveState(preloaded);

    const { result } = renderHook(() => usePinnedSidebarEntityState(makeOptions()));

    expect(result.current.pinnedIds).toContain("ops");
  });

  it("reloads state when userPubkey changes", () => {
    const guestState = pinEntityForRelays(createEmptyPinnedEntityState(), ["relay-one"], "guest-ch", IK);
    saveState(guestState, undefined);

    const userState = pinEntityForRelays(createEmptyPinnedEntityState(), ["relay-one"], "user-ch", IK);
    saveState(userState, "abc123");

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
    const { result } = renderHook(() => usePinnedSidebarEntityState(makeOptions()));

    act(() => {
      result.current.pinAcrossRelays("general");
    });

    const saved = loadState(undefined);
    expect(getPinnedEntityIdsForRelays(saved, ["relay-one"], IK)).toContain("general");
  });

  it("pins only to the relays where the entity is present", () => {
    const entityRelayIds = new Map([["ops", new Set(["relay-two"])]]);

    const { result } = renderHook(() =>
      usePinnedSidebarEntityState(makeOptions({
        effectiveActiveRelayIds: new Set(["relay-one", "relay-two"]),
        entityRelayIds,
      }))
    );

    act(() => {
      result.current.pinAcrossRelays("ops");
    });

    const saved = loadState(undefined);
    expect(getPinnedEntityIdsForRelays(saved, ["relay-two"], IK)).toContain("ops");
    expect(getPinnedEntityIdsForRelays(saved, ["relay-one"], IK)).not.toContain("ops");
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

    const saved = loadState(undefined);
    const pinned = getPinnedEntityIdsForRelays(saved, ["relay-one", "relay-two"], IK);
    expect(pinned).toContain("unknown-channel");
  });

  it("unpins from all active relays", () => {
    const initial = pinEntityForRelays(
      pinEntityForRelays(createEmptyPinnedEntityState(), ["relay-one"], "ops", IK),
      ["relay-two"], "ops", IK
    );
    saveState(initial);

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
