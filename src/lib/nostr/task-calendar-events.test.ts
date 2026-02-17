import { describe, expect, it } from "vitest";
import {
  buildLinkedTaskCalendarEvent,
  parseLinkedTaskDueFromCalendarEvent,
} from "./task-calendar-events";
import { NostrEventKind } from "./types";

describe("task calendar event helpers", () => {
  it("builds a date-based NIP-52 event when no due time is set", () => {
    const dueDate = new Date("2026-03-22T00:00:00.000Z");
    const event = buildLinkedTaskCalendarEvent({
      taskEventId: "task123",
      taskContent: "Plan launch",
      dueDate,
    });

    expect(event.kind).toBe(NostrEventKind.CalendarDateBased);
    expect(event.tags).toContainEqual(["title", "Plan launch"]);
    expect(event.tags).toContainEqual(["start", "2026-03-22"]);
    expect(event.tags).toContainEqual(["date_type", "due"]);
    expect(event.tags).toContainEqual(["d", "task-date-task123-due"]);
    expect(event.tags).toContainEqual(["e", "task123", "", "task"]);
  });

  it("builds a time-based NIP-52 event when due time is set", () => {
    const dueDate = new Date("2026-03-22T00:00:00.000Z");
    const event = buildLinkedTaskCalendarEvent({
      taskEventId: "task456",
      taskContent: "Ship update",
      dueDate,
      dueTime: "14:30",
      dateType: "end",
      relayUrl: "wss://relay.example",
    });

    expect(event.kind).toBe(NostrEventKind.CalendarTimeBased);
    expect(event.tags).toContainEqual(["e", "task456", "wss://relay.example", "task"]);
    expect(event.tags).toContainEqual(["due_time", "14:30"]);
    expect(event.tags).toContainEqual(["date_type", "end"]);
    expect(event.tags).toContainEqual(["d", "task-date-task456-end"]);
    expect(event.tags.some((tag) => tag[0] === "end" && /^\d+$/.test(tag[1]))).toBe(true);
  });

  it("parses linked due data from calendar event tags", () => {
    const parsed = parseLinkedTaskDueFromCalendarEvent(NostrEventKind.CalendarDateBased, [
      ["d", "deadline-1"],
      ["title", "Task"],
      ["start", "2026-03-23"],
      ["e", "task-1", "", "task"],
    ]);

    expect(parsed.taskId).toBe("task-1");
    expect(parsed.dueDate?.toISOString()).toBe("2026-03-23T00:00:00.000Z");
    expect(parsed.dateType).toBe("due");
  });
});
