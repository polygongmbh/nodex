import { describe, expect, it } from "vitest";
import {
  buildTaskPriorityUpdateEvent,
  extractPriorityTargetTaskId,
  isPriorityPropertyEvent,
  parsePriorityTag,
} from "./task-property-events";
import { NostrEventKind } from "@/lib/nostr/types";

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

  it("parses and clamps priority tags", () => {
    expect(parsePriorityTag([["priority", "90"]])).toBe(90);
    expect(parsePriorityTag([["priority", "200"]])).toBe(100);
    expect(parsePriorityTag([["priority", "-2"]])).toBe(0);
    expect(parsePriorityTag([["priority", "bad"]])).toBeUndefined();
  });

  it("detects priority property events and extracts target task id", () => {
    const tags = [
      ["priority", "40"],
      ["e", "task123", "", "property"],
    ];
    expect(isPriorityPropertyEvent(NostrEventKind.TextNote, tags)).toBe(true);
    expect(extractPriorityTargetTaskId(tags)).toBe("task123");
    expect(isPriorityPropertyEvent(NostrEventKind.Task, tags)).toBe(false);
  });

  it("detects priority property updates carried on state kinds", () => {
    const tags = [
      ["priority", "55"],
      ["e", "task456", "", "property"],
    ];

    expect(isPriorityPropertyEvent(NostrEventKind.GitStatusOpen, tags)).toBe(true);
    expect(isPriorityPropertyEvent(NostrEventKind.GitStatusApplied, tags)).toBe(true);
    expect(isPriorityPropertyEvent(NostrEventKind.GitStatusClosed, tags)).toBe(true);
    expect(isPriorityPropertyEvent(NostrEventKind.GitStatusDraft, tags)).toBe(true);
    expect(isPriorityPropertyEvent(NostrEventKind.Procedure, tags)).toBe(true);
  });
});
