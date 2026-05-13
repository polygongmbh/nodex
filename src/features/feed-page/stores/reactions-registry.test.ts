import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  __resetReactionsRegistryForTests,
  setReactionsByTargetId,
  useReactionsFor,
} from "./reactions-registry";

beforeEach(() => {
  __resetReactionsRegistryForTests();
});

describe("reactions-registry", () => {
  it("returns undefined when nothing is registered for the target", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    expect(result.current).toBeUndefined();
  });

  it("returns the entry after setReactionsByTargetId publishes it", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      setReactionsByTargetId(new Map([
        ["task-a", { totals: { "👍": 2 }, mine: ["👍"] }],
      ]));
    });
    expect(result.current).toEqual({ totals: { "👍": 2 }, mine: ["👍"] });
  });

  it("does not notify when the new map is shape-equal to the current state", () => {
    const { result, rerender } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      setReactionsByTargetId(new Map([["task-a", { totals: { "👍": 1 }, mine: [] }]]));
    });
    const first = result.current;
    act(() => {
      setReactionsByTargetId(new Map([["task-a", { totals: { "👍": 1 }, mine: [] }]]));
    });
    rerender();
    expect(result.current).toBe(first);
  });

  it("removes entries no longer present in the next map", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      setReactionsByTargetId(new Map([["task-a", { totals: { "👍": 1 }, mine: [] }]]));
    });
    expect(result.current).toBeDefined();
    act(() => {
      setReactionsByTargetId(new Map());
    });
    expect(result.current).toBeUndefined();
  });

  it("isolates updates between targets", () => {
    const a = renderHook(() => useReactionsFor("task-a"));
    const b = renderHook(() => useReactionsFor("task-b"));
    act(() => {
      setReactionsByTargetId(new Map([
        ["task-a", { totals: { "👍": 1 }, mine: [] }],
      ]));
    });
    expect(a.result.current).toEqual({ totals: { "👍": 1 }, mine: [] });
    expect(b.result.current).toBeUndefined();
  });
});
