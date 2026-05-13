import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import {
  areTaskFieldsEqual,
  preserveTaskIdentity,
  preserveTaskListIdentity,
} from "./task-identity";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    author: { pubkey: "alice", name: "Alice" },
    content: "Hello",
    tags: ["work"],
    relays: ["relay-a"],
    taskType: "task",
    timestamp: new Date("2026-02-17T10:00:00.000Z"),
    state: { status: "open" },
    ...overrides,
  } as Task;
}

describe("areTaskFieldsEqual", () => {
  it("returns true when both tasks carry the same signal", () => {
    const a = makeTask();
    const b = makeTask();
    expect(areTaskFieldsEqual(a, b)).toBe(true);
  });

  it("treats fresh status objects with the same type+description as equal", () => {
    const a = makeTask({ state: { status: "active", description: "in progress" } });
    const b = makeTask({ state: { status: "active", description: "in progress" } });
    expect(areTaskFieldsEqual(a, b)).toBe(true);
  });

  it("detects a real status change", () => {
    const a = makeTask({ state: { status: "open" } });
    const b = makeTask({ state: { status: "active" } });
    expect(areTaskFieldsEqual(a, b)).toBe(false);
  });

  it("detects a new relay arriving", () => {
    const a = makeTask({ relays: ["relay-a"] });
    const b = makeTask({ relays: ["relay-a", "relay-b"] });
    expect(areTaskFieldsEqual(a, b)).toBe(false);
  });

  it("detects a new state update", () => {
    const a = makeTask({
      stateUpdates: [
        {
          id: "s1",
          state: { status: "active" },
          timestamp: new Date("2026-02-17T10:01:00.000Z"),
          authorPubkey: "alice",
        },
      ],
    });
    const b = makeTask({
      stateUpdates: [
        {
          id: "s1",
          state: { status: "active" },
          timestamp: new Date("2026-02-17T10:01:00.000Z"),
          authorPubkey: "alice",
        },
        {
          id: "s2",
          state: { status: "done" },
          timestamp: new Date("2026-02-17T10:02:00.000Z"),
          authorPubkey: "alice",
        },
      ],
    });
    expect(areTaskFieldsEqual(a, b)).toBe(false);
  });

  it("detects a lastEditedAt change", () => {
    const a = makeTask({ lastEditedAt: new Date("2026-02-17T10:00:00.000Z") });
    const b = makeTask({ lastEditedAt: new Date("2026-02-17T10:05:00.000Z") });
    expect(areTaskFieldsEqual(a, b)).toBe(false);
  });

  it("detects reactions arriving on a previously reaction-less task", () => {
    const a = makeTask();
    const b = makeTask({ reactions: { totals: { "👍": 1 }, mine: ["👍"] } });
    expect(areTaskFieldsEqual(a, b)).toBe(false);
  });

  it("detects reaction count changes", () => {
    const a = makeTask({ reactions: { totals: { "👍": 1 }, mine: [] } });
    const b = makeTask({ reactions: { totals: { "👍": 2 }, mine: [] } });
    expect(areTaskFieldsEqual(a, b)).toBe(false);
  });

  it("treats reaction-equivalent tasks as equal", () => {
    const a = makeTask({ reactions: { totals: { "👍": 2, "❤️": 1 }, mine: ["👍"] } });
    const b = makeTask({ reactions: { totals: { "❤️": 1, "👍": 2 }, mine: ["👍"] } });
    expect(areTaskFieldsEqual(a, b)).toBe(true);
  });
});

describe("preserveTaskIdentity", () => {
  it("returns the previous reference when the fresh copy is equivalent", () => {
    const previous = makeTask();
    const fresh = makeTask();
    expect(preserveTaskIdentity(previous, fresh)).toBe(previous);
  });

  it("returns the fresh task when its status changed", () => {
    const previous = makeTask({ state: { status: "open" } });
    const fresh = makeTask({ state: { status: "done" } });
    expect(preserveTaskIdentity(previous, fresh)).toBe(fresh);
  });

  it("returns the fresh task when there is no previous entry", () => {
    const fresh = makeTask();
    expect(preserveTaskIdentity(undefined, fresh)).toBe(fresh);
  });

  it("returns the fresh task when ids differ (defensive)", () => {
    const previous = makeTask({ id: "other" });
    const fresh = makeTask({ id: "task-1" });
    expect(preserveTaskIdentity(previous, fresh)).toBe(fresh);
  });
});

describe("preserveTaskListIdentity", () => {
  it("reuses prior references for unchanged tasks even when the array is new", () => {
    const previous = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    const fresh = [
      makeTask({ id: "a" }),
      makeTask({ id: "b" }),
    ];
    const preserved = preserveTaskListIdentity(previous, fresh);
    expect(preserved[0]).toBe(previous[0]);
    expect(preserved[1]).toBe(previous[1]);
  });

  it("only swaps in the fresh reference for tasks that actually changed", () => {
    const previous = [
      makeTask({ id: "a", state: { status: "open" } }),
      makeTask({ id: "b", state: { status: "open" } }),
    ];
    const fresh = [
      makeTask({ id: "a", state: { status: "open" } }),
      makeTask({ id: "b", state: { status: "done" } }),
    ];
    const preserved = preserveTaskListIdentity(previous, fresh);
    expect(preserved[0]).toBe(previous[0]);
    expect(preserved[1]).toBe(fresh[1]);
  });

  it("returns the fresh array when no prior tasks exist", () => {
    const fresh = [makeTask()];
    expect(preserveTaskListIdentity([], fresh)).toBe(fresh);
  });
});
