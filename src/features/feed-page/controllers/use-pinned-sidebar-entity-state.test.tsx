import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";

interface TestState {
  pinnedIdsByRelay: Record<string, string[]>;
}

describe("usePinnedSidebarEntityState", () => {
  it("loads, persists, and updates relay-scoped pinned ids through the shared controller scaffold", () => {
    const loadState = vi.fn((pubkey?: string): TestState => ({
      pinnedIdsByRelay: pubkey === "user-two"
        ? { "relay-one": ["beta"] }
        : { "relay-one": ["alpha"] },
    }));
    const saveState = vi.fn();
    const getPinnedIdsForRelays = vi.fn((state: TestState, relayIds: string[]) =>
      relayIds.flatMap((relayId) => state.pinnedIdsByRelay[relayId] || [])
    );
    const pinForRelays = vi.fn((state: TestState, relayIds: string[], entityId: string): TestState => ({
      pinnedIdsByRelay: Object.fromEntries(
        relayIds.map((relayId) => [relayId, [...(state.pinnedIdsByRelay[relayId] || []), entityId]])
      ),
    }));
    const unpinFromRelays = vi.fn((state: TestState, relayIds: string[], entityId: string): TestState => ({
      pinnedIdsByRelay: Object.fromEntries(
        relayIds.map((relayId) => [relayId, (state.pinnedIdsByRelay[relayId] || []).filter((id) => id !== entityId)])
      ),
    }));

    const { result, rerender } = renderHook(
      ({ userPubkey }) =>
        usePinnedSidebarEntityState({
          userPubkey,
          effectiveActiveRelayIds: new Set(["relay-one"]),
          loadState,
          saveState,
          getPinnedIdsForRelays,
          pinForRelays,
          unpinFromRelays,
        }),
      { initialProps: { userPubkey: undefined as string | undefined } }
    );

    expect(result.current.pinnedIds).toEqual(["alpha"]);

    act(() => {
      result.current.pinAcrossRelays(["relay-one"], "gamma");
    });

    expect(result.current.pinnedIds).toEqual(["alpha", "gamma"]);

    act(() => {
      result.current.unpinAcrossRelays("alpha");
    });

    expect(result.current.pinnedIds).toEqual(["gamma"]);

    rerender({ userPubkey: "user-two" });

    expect(result.current.pinnedIds).toEqual(["beta"]);
    expect(loadState).toHaveBeenCalledWith(undefined);
    expect(loadState).toHaveBeenCalledWith("user-two");
    expect(saveState).toHaveBeenCalled();
    expect(getPinnedIdsForRelays).toHaveBeenCalled();
    expect(pinForRelays).toHaveBeenCalledWith(
      { pinnedIdsByRelay: { "relay-one": ["alpha"] } },
      ["relay-one"],
      "gamma"
    );
    expect(unpinFromRelays).toHaveBeenCalledWith(
      { pinnedIdsByRelay: { "relay-one": ["alpha", "gamma"] } },
      ["relay-one"],
      "alpha"
    );
  });
});
