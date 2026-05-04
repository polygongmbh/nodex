import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFeedHydrationWindow } from "./use-feed-hydration-window";

// With useLayoutEffect restoring filters synchronously, navigating back produces:
//   render A → disclosureKey = PARENT_CLEARED (focusedTaskId=null, filters still cleared)
//   render B → disclosureKey = PARENT_RESTORED (focusedTaskId=null, filters restored)
// Separate act() calls simulate each render firing its own passive effects independently,
// matching browser behaviour where intermediate renders run before startTransition settles.

const PARENT_RESTORED = "null|or|relays|channels|people|quick";
const PARENT_CLEARED  = "null|and|||quick";    // intermediate: focusedTaskId=null + cleared filters
const SUBTASK_CLEARED = "taskA|and|||quick";   // subtask with cleared filters

describe("useFeedHydrationWindow", () => {
  it("restores visible entry count on both first and second exit from same subtask", () => {
    const TOTAL = 200;
    const { result, rerender } = renderHook(
      ({ disclosureKey, focusedTaskId }) =>
        useFeedHydrationWindow({ disclosureKey, focusedTaskId, totalEntryCount: TOTAL }),
      { initialProps: { disclosureKey: PARENT_RESTORED, focusedTaskId: null as string | null } }
    );

    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    expect(result.current.visibleEntryCount).toBe(130);

    act(() => { rerender({ disclosureKey: SUBTASK_CLEARED, focusedTaskId: "taskA" }); });
    expect(result.current.visibleEntryCount).toBe(40);

    act(() => { rerender({ disclosureKey: PARENT_CLEARED, focusedTaskId: null }); });
    act(() => { rerender({ disclosureKey: PARENT_RESTORED, focusedTaskId: null }); });
    const after1stExit = result.current.visibleEntryCount;

    act(() => { rerender({ disclosureKey: SUBTASK_CLEARED, focusedTaskId: "taskA" }); });
    expect(result.current.visibleEntryCount).toBe(40);

    act(() => { rerender({ disclosureKey: PARENT_CLEARED, focusedTaskId: null }); });
    act(() => { rerender({ disclosureKey: PARENT_RESTORED, focusedTaskId: null }); });
    const after2ndExit = result.current.visibleEntryCount;

    expect(after1stExit).toBe(130);
    expect(after2ndExit).toBe(130);
  });
});
