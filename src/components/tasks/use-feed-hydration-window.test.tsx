import { act, renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useFeedHydrationWindow } from "./use-feed-hydration-window";

// With useLayoutEffect restoring filters synchronously, navigating back produces:
//   render A → disclosureKey = PARENT_CLEARED (focusedTaskId=null, filters still cleared)
//   render B → disclosureKey = PARENT_RESTORED (focusedTaskId=null, filters restored)
// Separate act() calls simulate each render firing its own passive effects independently,
// matching browser behaviour where intermediate renders run before startTransition settles.

describe("useFeedHydrationWindow", () => {
  it("resets visible entry count when filterKey changes at top level", () => {
    const TOTAL = 200;
    const { result, rerender } = renderHook(
      ({ focusedTaskId, filterKey }) =>
        useFeedHydrationWindow({ focusedTaskId, totalEntryCount: TOTAL, filterKey }),
      { initialProps: { focusedTaskId: null as string | null, filterKey: "channel-a" } }
    );

    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    expect(result.current.visibleEntryCount).toBe(130);

    act(() => { rerender({ focusedTaskId: null, filterKey: "channel-b" }); });
    expect(result.current.visibleEntryCount).toBe(40);
  });

  it("resets visible entry count on both first and second exit from same subtask", () => {
    const TOTAL = 200;
    const { result, rerender } = renderHook(
      ({ focusedTaskId }) =>
        useFeedHydrationWindow({ focusedTaskId, totalEntryCount: TOTAL }),
      { initialProps: { focusedTaskId: null as string | null } }
    );

    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    expect(result.current.visibleEntryCount).toBe(130);

    act(() => { rerender({ focusedTaskId: "taskA" }); });
    expect(result.current.visibleEntryCount).toBe(40);

    // Two separate rerenders simulate the intermediate render pair produced by
    // useLayoutEffect restoring filters (P_cleared then P_restored).
    act(() => { rerender({ focusedTaskId: null }); });
    act(() => { rerender({ focusedTaskId: null }); });
    const after1stExit = result.current.visibleEntryCount;

    act(() => { rerender({ focusedTaskId: "taskA" }); });
    expect(result.current.visibleEntryCount).toBe(40);

    act(() => { rerender({ focusedTaskId: null }); });
    act(() => { rerender({ focusedTaskId: null }); });
    const after2ndExit = result.current.visibleEntryCount;

    expect(after1stExit).toBe(130);
    expect(after2ndExit).toBe(130);
  });

  it("still restores parent count when filterKey changes mid-task due to scope-specific filter clear/restore", () => {
    // useTaskScopeSpecificFilters clears filters on task entry (filterKey: "ch" → "")
    // and restores them on exit (filterKey: "" → "ch"), each in a separate render.
    // The hydration window must NOT clear savedParentCountRef on the mid-task filter
    // clear, and must NOT reset to initial on the restoration render after exit.
    const TOTAL = 200;
    const { result, rerender } = renderHook(
      ({ focusedTaskId, filterKey }) =>
        useFeedHydrationWindow({ focusedTaskId, totalEntryCount: TOTAL, filterKey }),
      { initialProps: { focusedTaskId: null as string | null, filterKey: "channel-a" } }
    );

    act(() => { result.current.revealMoreEntries("scroll"); });
    act(() => { result.current.revealMoreEntries("scroll"); });
    expect(result.current.visibleEntryCount).toBe(100);

    // Enter subtask — parent count (100) is saved
    act(() => { rerender({ focusedTaskId: "taskA", filterKey: "channel-a" }); });
    expect(result.current.visibleEntryCount).toBe(40);

    // Scope-specific hook clears filters (separate render, focusedTaskId unchanged)
    act(() => { rerender({ focusedTaskId: "taskA", filterKey: "" }); });
    expect(result.current.visibleEntryCount).toBe(40);

    // Return from subtask (render A — filters still cleared)
    act(() => { rerender({ focusedTaskId: null, filterKey: "" }); });
    expect(result.current.visibleEntryCount).toBe(100);

    // Scope-specific hook restores filters (render B — filterKey change must NOT reset)
    act(() => { rerender({ focusedTaskId: null, filterKey: "channel-a" }); });
    expect(result.current.visibleEntryCount).toBe(100);

    // Now a real channel switch at top level SHOULD reset
    act(() => { rerender({ focusedTaskId: null, filterKey: "channel-b" }); });
    expect(result.current.visibleEntryCount).toBe(40);
  });

});
