import { describe, expect, it } from "vitest";
import { buildTaskPriorityUpdateEvent } from "./task-property-events";
import { NostrEventKind } from "./types";

describe("task property event helpers", () => {
  it("builds a priority property update as kind:1 with property marker", () => {
    const event = buildTaskPriorityUpdateEvent({
      taskEventId: "task123",
      priority: 70,
      relayUrl: "wss://relay.example",
    });

    expect(event.kind).toBe(NostrEventKind.TextNote);
    expect(event.content).toBe("Priority: 70");
    expect(event.tags).toContainEqual(["priority", "70"]);
    expect(event.tags).toContainEqual(["e", "task123", "wss://relay.example", "property"]);
  });
});
