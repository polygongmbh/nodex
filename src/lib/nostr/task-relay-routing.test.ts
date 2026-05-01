import { describe, expect, it } from "vitest";
import type { Relay, Task } from "@/types";
import {
  RELAY_SELECTION_ERROR_KEY,
  resolveEffectiveWritableRelayIds,
  resolveOriginRelayIdForTask,
  resolveRelaySelectionForSubmission,
} from "./task-relay-routing";
import { makePerson } from "@/test/fixtures";

const makeRelay = (id: string, url: string = `wss://${id}.example`): Relay => ({
  id,
  name: id,
  isActive: true,
  url,
  connectionStatus: "connected",
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "a".repeat(64),
  author: makePerson({ pubkey: "b".repeat(64), name: "alice", displayName: "Alice" }),
  content: "Task",
  tags: ["backend"],
  relays: ["relay-a"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
  ...overrides,
});

describe("resolveOriginRelayIdForTask", () => {
  it("prefers first non-demo relay", () => {
    const task = makeTask({ relays: ["demo", "relay-b", "relay-a"] });
    expect(resolveOriginRelayIdForTask(task, "demo")).toBe("relay-b");
  });

  it("falls back to first relay when only demo relay exists", () => {
    const task = makeTask({ relays: ["demo"] });
    expect(resolveOriginRelayIdForTask(task, "demo")).toBe("demo");
  });
});

describe("resolveRelaySelectionForSubmission", () => {
  const relays = [makeRelay("demo"), makeRelay("relay-a", "wss://a.example"), makeRelay("relay-b", "wss://b.example")];

  it("requires exactly one relay for root task creation", () => {
    const result = resolveRelaySelectionForSubmission({
      taskType: "task",
      selectedRelayIds: ["relay-a", "relay-b"],
      relays,
      demoRelayId: "demo",
    });
    expect(result.errorKey).toBe(RELAY_SELECTION_ERROR_KEY);
  });

  it("allows one selected relay for root task creation", () => {
    const result = resolveRelaySelectionForSubmission({
      taskType: "task",
      selectedRelayIds: ["relay-a"],
      relays,
      demoRelayId: "demo",
    });
    expect(result.relayIds).toEqual(["relay-a"]);
  });

  it("keeps all selected relays for top-level comments", () => {
    const result = resolveRelaySelectionForSubmission({
      taskType: "comment",
      selectedRelayIds: ["relay-a", "relay-b"],
      relays,
      demoRelayId: "demo",
    });
    expect(result.relayIds).toEqual(["relay-a", "relay-b"]);
  });

  it("keeps only writable selected relays for top-level comments", () => {
    const result = resolveRelaySelectionForSubmission({
      taskType: "comment",
      selectedRelayIds: ["relay-a", "relay-b"],
      relays: [
        makeRelay("relay-a", "wss://a.example"),
        { ...makeRelay("relay-b", "wss://b.example"), connectionStatus: "read-only" },
      ],
      demoRelayId: undefined,
    });

    expect(result.relayIds).toEqual(["relay-a"]);
    expect(result.errorKey).toBeUndefined();
  });

  it("rejects top-level comments when every selected relay is non-writable", () => {
    const result = resolveRelaySelectionForSubmission({
      taskType: "comment",
      selectedRelayIds: ["relay-a", "relay-b"],
      relays: [
        { ...makeRelay("relay-a", "wss://a.example"), connectionStatus: "read-only" },
        { ...makeRelay("relay-b", "wss://b.example"), connectionStatus: "disconnected" },
      ],
      demoRelayId: undefined,
    });

    expect(result.relayIds).toEqual([]);
    expect(result.errorKey).toBe(RELAY_SELECTION_ERROR_KEY);
  });

  it("routes child task and comment submissions to parent origin relay", () => {
    const parent = makeTask({ relays: ["relay-b"] });
    const taskResult = resolveRelaySelectionForSubmission({
      taskType: "task",
      selectedRelayIds: ["relay-a", "relay-b"],
      relays,
      parentTask: parent,
      demoRelayId: "demo",
    });
    const commentResult = resolveRelaySelectionForSubmission({
      taskType: "comment",
      selectedRelayIds: ["relay-a", "relay-b"],
      relays,
      parentTask: parent,
      demoRelayId: "demo",
    });

    expect(taskResult.relayIds).toEqual(["relay-b"]);
    expect(commentResult.relayIds).toEqual(["relay-b"]);
  });

  it("requires at least one relay for top-level comments", () => {
    const result = resolveRelaySelectionForSubmission({
      taskType: "comment",
      selectedRelayIds: [],
      relays: relays.filter((relay) => relay.id !== "demo"),
      demoRelayId: undefined,
    });
    expect(result.errorKey).toBe(RELAY_SELECTION_ERROR_KEY);
  });

  it("defaults to the only active postable relay when none is explicitly selected", () => {
    const singleActiveRelays: Relay[] = [
      makeRelay("relay-a", "wss://a.example"),
      { ...makeRelay("relay-b", "wss://b.example"), isActive: false, connectionStatus: "connected" as const },
    ];
    const taskResult = resolveRelaySelectionForSubmission({
      taskType: "task",
      selectedRelayIds: [],
      relays: singleActiveRelays,
      demoRelayId: undefined,
    });
    const commentResult = resolveRelaySelectionForSubmission({
      taskType: "comment",
      selectedRelayIds: [],
      relays: singleActiveRelays,
      demoRelayId: undefined,
    });

    expect(taskResult.relayIds).toEqual(["relay-a"]);
    expect(commentResult.relayIds).toEqual(["relay-a"]);
    expect(taskResult.errorKey).toBeUndefined();
    expect(commentResult.errorKey).toBeUndefined();
  });
});

describe("resolveEffectiveWritableRelayIds", () => {
  it("returns the selected writable relays when any are selected", () => {
    expect(resolveEffectiveWritableRelayIds({
      selectedRelayIds: ["relay-a"],
      relays: [makeRelay("relay-a", "wss://a.example"), makeRelay("relay-b", "wss://b.example")],
    })).toEqual(["relay-a"]);
  });

  it("falls back to the only writable relay when none are selected", () => {
    expect(resolveEffectiveWritableRelayIds({
      selectedRelayIds: [],
      relays: [{ ...makeRelay("relay-a", "wss://a.example"), isActive: false }],
    })).toEqual(["relay-a"]);
  });

  it("returns empty when none are selected and multiple writable relays exist", () => {
    expect(resolveEffectiveWritableRelayIds({
      selectedRelayIds: [],
      relays: [
        { ...makeRelay("relay-a", "wss://a.example"), isActive: false },
        { ...makeRelay("relay-b", "wss://b.example"), isActive: false },
      ],
    })).toEqual([]);
  });
});
