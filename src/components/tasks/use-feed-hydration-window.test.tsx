import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFeedHydrationWindow } from "./use-feed-hydration-window";

// With useLayoutEffect restoring filters synchronously, navigating back produces:
//   render A → disclosureKey = PARENT_CLEARED (focusedTaskId=null, filters still cleared)
//   render B → disclosureKey = PARENT_RESTORED (focusedTaskId=null, filters restored)
// In the browser, each render fires its passive effects independently. This test simulates
// that with separate act() calls to check whether PARENT_CLEARED corrupts the LRU so that
// the second exit fails to restore the correct count.

const PARENT_RESTORED = "null|or|relays|channels|people|quick";
const PARENT_CLEARED  = "null|and|||quick";      // intermediate: focusedTaskId=null + cleared filters
const SUBTASK_CLEARED = "taskA|and|||quick";      // subtask with cleared filters

describe("useFeedHydrationWindow", () => {
  it("restores visible entry count on both first and second exit from same subtask", () => {
    const TOTAL = 200;
    const { result, rerender } = renderHook(
      ({ disclosureKey }) =>
        useFeedHydrationWindow({ disclosureKey, totalEntryCount: TOTAL }),
      { initialProps: { disclosureKey: PARENT_RESTORED } }
    );

    // Scroll to 130 entries (40 + 30 + 30)
    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    expect(result.current.visibleEntryCount).toBe(130);

    // Cycle 1 entry
    act(() => { rerender({ disclosureKey: SUBTASK_CLEARED }); });
    expect(result.current.visibleEntryCount).toBe(40);

    // Cycle 1 exit: two sequential renders as in browser (intermediate then final).
    // Using separate act() calls so each render's passive effects fire independently,
    // matching browser behavior where the intermediate key can corrupt the LRU.
    act(() => { rerender({ disclosureKey: PARENT_CLEARED }); });
    act(() => { rerender({ disclosureKey: PARENT_RESTORED }); });
    const after1stExit = result.current.visibleEntryCount;

    // Cycle 2 entry
    act(() => { rerender({ disclosureKey: SUBTASK_CLEARED }); });
    expect(result.current.visibleEntryCount).toBe(40);

    // Cycle 2 exit: same intermediate-then-final pattern
    act(() => { rerender({ disclosureKey: PARENT_CLEARED }); });
    act(() => { rerender({ disclosureKey: PARENT_RESTORED }); });
    const after2ndExit = result.current.visibleEntryCount;

    expect(after1stExit).toBe(130);
    expect(after2ndExit).toBe(130);
  });
});
