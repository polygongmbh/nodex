import { describe, expect, it } from "vitest";
import type { Relay, Task } from "@/types";
import {
  RELAY_SELECTION_ERROR_KEY,
  resolveOriginRelayIdForTask,
  resolveRelaySelectionForSubmission,
} from "./task-relay-routing";

const makeRelay = (id: string, url?: string): Relay => ({
  id,
  name: id,
  icon: "R",
  isActive: true,
  url,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "a".repeat(64),
  author: {
    id: "b".repeat(64),
    name: "alice",
    displayName: "Alice",
    isOnline: true,
    isSelected: false,
  },
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
});
