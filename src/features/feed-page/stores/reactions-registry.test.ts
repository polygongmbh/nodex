import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  __resetReactionsRegistryForTests,
  bootstrapReactions,
  mergeReactionEvents,
  setReactionsViewerPubkey,
  useReactionsFor,
} from "./reactions-registry";
import { NostrEventKind } from "@/lib/nostr/types";

function reaction(id: string, pubkey: string, targetId: string, content = "👍") {
  return {
    id,
    pubkey,
    content,
    tags: [["e", targetId], ["p", "target-owner"]],
    kind: NostrEventKind.Reaction,
  };
}

function deletion(id: string, pubkey: string, reactionIds: string[]) {
  return {
    id,
    pubkey,
    content: "",
    tags: reactionIds.map((rid) => ["e", rid] as string[]),
    kind: NostrEventKind.EventDeletion,
  };
}

beforeEach(() => {
  __resetReactionsRegistryForTests();
});

describe("reactions-registry", () => {
  it("returns undefined when nothing is registered for the target", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    expect(result.current).toBeUndefined();
  });

  it("publishes a reaction snapshot after a reaction event is merged", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      setReactionsViewerPubkey("viewer");
      mergeReactionEvents([reaction("r1", "viewer", "task-a")]);
    });
    expect(result.current).toEqual({
      totals: { "👍": 1 },
      mine: ["👍"],
      mineEventIdsByEmoji: { "👍": ["r1"] },
    });
  });

  it("merges multiple reactors into the same target", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      mergeReactionEvents([
        reaction("r1", "alice", "task-a"),
        reaction("r2", "bob", "task-a", "❤️"),
        reaction("r3", "carol", "task-a"),
      ]);
    });
    expect(result.current?.totals).toEqual({ "👍": 2, "❤️": 1 });
  });

  it("is idempotent when the same event is merged again", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    const first = result.current;
    act(() => {
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    expect(result.current).toBe(first);
  });

  it("removes a reaction when its author publishes a NIP-09 deletion for it", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    expect(result.current?.totals["👍"]).toBe(1);
    act(() => {
      mergeReactionEvents([deletion("d1", "alice", ["r1"])]);
    });
    expect(result.current).toBeUndefined();
  });

  it("ignores a deletion published by someone other than the reactor", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      mergeReactionEvents([
        reaction("r1", "alice", "task-a"),
        deletion("d1", "mallory", ["r1"]),
      ]);
    });
    expect(result.current?.totals["👍"]).toBe(1);
  });

  it("handles a deletion that arrives before its reaction (out-of-order ingest)", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      mergeReactionEvents([deletion("d1", "alice", ["r1"])]);
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    expect(result.current).toBeUndefined();
  });

  it("re-derives `mine` when the viewer pubkey changes", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      setReactionsViewerPubkey("alice");
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    expect(result.current?.mine).toEqual(["👍"]);
    act(() => {
      setReactionsViewerPubkey("bob");
    });
    expect(result.current?.mine).toEqual([]);
  });

  it("bootstrapReactions clears prior state and re-folds the provided events", () => {
    const { result } = renderHook(() => useReactionsFor("task-a"));
    act(() => {
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    expect(result.current?.totals["👍"]).toBe(1);
    act(() => {
      bootstrapReactions([reaction("r2", "bob", "task-b")], undefined);
    });
    expect(result.current).toBeUndefined();
  });

  it("isolates updates between targets", () => {
    const a = renderHook(() => useReactionsFor("task-a"));
    const b = renderHook(() => useReactionsFor("task-b"));
    act(() => {
      mergeReactionEvents([reaction("r1", "alice", "task-a")]);
    });
    expect(a.result.current?.totals["👍"]).toBe(1);
    expect(b.result.current).toBeUndefined();
  });
});
