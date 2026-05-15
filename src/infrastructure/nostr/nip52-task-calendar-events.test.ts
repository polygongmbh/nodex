import { describe, expect, it } from "vitest";
import {
  buildLinkedTaskCalendarEvent,
  buildStandaloneCalendarEvent,
  parseCalendarEventDates,
  parseLinkedTaskDueFromCalendarEvent,
  parseStandaloneCalendarEvent,
} from "./nip52-task-calendar-events";
import { NostrEventKind, type NostrEvent } from "@/lib/nostr/types";
import { isDateBasedEventPost, isTimeBasedEventPost } from "@/types";

function makeRawEvent(partial: Partial<NostrEvent> & { kind: NostrEventKind; tags: string[][] }): NostrEvent {
  return {
    id: "event-id",
    pubkey: "pub1",
    created_at: 1_700_000_000,
    kind: partial.kind,
    tags: partial.tags,
    content: partial.content ?? "",
    sig: "sig",
    ...partial,
  };
}

describe("task calendar event helpers", () => {
  it("builds a date-based NIP-52 event when no due time is set", () => {
    const dueDate = new Date(2026, 2, 22);
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

  it("preserves the calendar day regardless of timezone offset", () => {
    const dueDate = new Date(2026, 2, 22);
    const event = buildLinkedTaskCalendarEvent({
      taskEventId: "task-tz",
      taskContent: "TZ check",
      dueDate,
    });
    const startTag = event.tags.find((t) => t[0] === "start");
    expect(startTag?.[1]).toBe("2026-03-22");

    const parsed = parseLinkedTaskDueFromCalendarEvent(NostrEventKind.CalendarDateBased, event.tags);
    expect(parsed.dueDate?.getFullYear()).toBe(2026);
    expect(parsed.dueDate?.getMonth()).toBe(2);
    expect(parsed.dueDate?.getDate()).toBe(22);
  });

  it("builds a time-based NIP-52 event when due time is set", () => {
    const dueDate = new Date(2026, 2, 22);
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
    expect(event.tags.some((tag) => tag[0] === "due_time")).toBe(false);
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
    expect(parsed.dueDate?.getFullYear()).toBe(2026);
    expect(parsed.dueDate?.getMonth()).toBe(2);
    expect(parsed.dueDate?.getDate()).toBe(23);
    expect(parsed.dateType).toBe("due");
  });

  describe("parseCalendarEventDates", () => {
    it("parses a date-based event start and end as ISO strings", () => {
      const parsed = parseCalendarEventDates(NostrEventKind.CalendarDateBased, [
        ["start", "2026-04-01"],
        ["end", "2026-04-03"],
        ["date_type", "scheduled"],
      ]);
      expect(parsed.kind).toBe(NostrEventKind.CalendarDateBased);
      expect(parsed.startDate).toBe("2026-04-01");
      expect(parsed.endDate).toBe("2026-04-03");
      expect(parsed.dateType).toBe("scheduled");
    });

    it("parses a time-based event start and end as Date objects", () => {
      const startUnix = Math.floor(new Date(2026, 3, 1, 10, 30).getTime() / 1000);
      const endUnix = Math.floor(new Date(2026, 3, 1, 11, 30).getTime() / 1000);
      const parsed = parseCalendarEventDates(NostrEventKind.CalendarTimeBased, [
        ["start", String(startUnix)],
        ["end", String(endUnix)],
      ]);
      expect(parsed.kind).toBe(NostrEventKind.CalendarTimeBased);
      expect(parsed.start?.getHours()).toBe(10);
      expect(parsed.start?.getMinutes()).toBe(30);
      expect(parsed.end?.getHours()).toBe(11);
    });

    it("returns missing start for malformed values", () => {
      const parsed = parseCalendarEventDates(NostrEventKind.CalendarTimeBased, [
        ["start", "not-a-number"],
      ]);
      expect(parsed.start).toBeUndefined();
    });
  });

  describe("parseStandaloneCalendarEvent", () => {
    it("returns null when the event references a task (linked-hydration path owns it)", () => {
      const event = makeRawEvent({
        kind: NostrEventKind.CalendarTimeBased,
        tags: [
          ["start", "1700000000"],
          ["e", "task-x", "", "task"],
        ],
      });
      expect(parseStandaloneCalendarEvent(event)).toBeNull();
    });

    it("returns a DateBasedEventPost for kind 31922 with title/summary/location", () => {
      const event = makeRawEvent({
        id: "evt-31922",
        pubkey: "pub-author",
        kind: NostrEventKind.CalendarDateBased,
        tags: [
          ["d", "evt-d-tag"],
          ["title", "Conference"],
          ["summary", "Annual gathering"],
          ["location", "Berlin"],
          ["start", "2026-05-10"],
          ["end", "2026-05-12"],
          ["p", "pub-attendee-1"],
        ],
        content: "Body text",
      });
      const post = parseStandaloneCalendarEvent(event);
      expect(post).not.toBeNull();
      expect(isDateBasedEventPost(post!)).toBe(true);
      if (isDateBasedEventPost(post!)) {
        expect(post.startDate).toBe("2026-05-10");
        expect(post.endDate).toBe("2026-05-12");
      }
      expect(post!.title).toBe("Conference");
      expect(post!.summary).toBe("Annual gathering");
      expect(post!.location).toBe("Berlin");
      expect(post!.mentions).toContain("pub-attendee-1");
    });

    it("returns a TimeBasedEventPost for kind 31923", () => {
      const startUnix = Math.floor(new Date(2026, 4, 10, 9).getTime() / 1000);
      const event = makeRawEvent({
        id: "evt-31923",
        kind: NostrEventKind.CalendarTimeBased,
        tags: [
          ["d", "evt-d-tag"],
          ["title", "Standup"],
          ["start", String(startUnix)],
        ],
      });
      const post = parseStandaloneCalendarEvent(event);
      expect(post).not.toBeNull();
      expect(isTimeBasedEventPost(post!)).toBe(true);
    });

    it("returns null when start is missing", () => {
      const event = makeRawEvent({
        kind: NostrEventKind.CalendarTimeBased,
        tags: [["title", "No start"]],
      });
      expect(parseStandaloneCalendarEvent(event)).toBeNull();
    });
  });

  describe("buildStandaloneCalendarEvent", () => {
    it("emits kind 31922 with ISO start/end when isAllDay", () => {
      const built = buildStandaloneCalendarEvent({
        title: "Off-site",
        content: "Plan the off-site",
        start: new Date(2026, 5, 1),
        end: new Date(2026, 5, 3),
        isAllDay: true,
      });
      expect(built.kind).toBe(NostrEventKind.CalendarDateBased);
      expect(built.tags).toContainEqual(["title", "Off-site"]);
      expect(built.tags).toContainEqual(["start", "2026-06-01"]);
      expect(built.tags).toContainEqual(["end", "2026-06-03"]);
      expect(built.tags.find((t) => t[0] === "d")?.[1]).toBeTruthy();
    });

    it("emits kind 31923 with unix-second start/end when timed", () => {
      const start = new Date(2026, 5, 1, 10, 0);
      const end = new Date(2026, 5, 1, 11, 0);
      const built = buildStandaloneCalendarEvent({
        title: "Meeting",
        content: "1:1",
        start,
        end,
        isAllDay: false,
      });
      expect(built.kind).toBe(NostrEventKind.CalendarTimeBased);
      const startTag = built.tags.find((t) => t[0] === "start");
      const endTag = built.tags.find((t) => t[0] === "end");
      expect(startTag?.[1]).toBe(String(Math.floor(start.getTime() / 1000)));
      expect(endTag?.[1]).toBe(String(Math.floor(end.getTime() / 1000)));
    });

    it("includes summary, location, p-tags, and t-tags", () => {
      const built = buildStandaloneCalendarEvent({
        title: "Demo",
        content: "Demo #launch",
        start: new Date(2026, 5, 1, 14, 0),
        isAllDay: false,
        summary: "Quick demo",
        location: "Zoom",
        mentions: ["pub-1", "pub-2"],
      });
      expect(built.tags).toContainEqual(["summary", "Quick demo"]);
      expect(built.tags).toContainEqual(["location", "Zoom"]);
      expect(built.tags).toContainEqual(["p", "pub-1"]);
      expect(built.tags).toContainEqual(["p", "pub-2"]);
      expect(built.tags).toContainEqual(["t", "launch"]);
    });
  });
});
