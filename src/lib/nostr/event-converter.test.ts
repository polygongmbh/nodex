import { describe, it, expect } from "vitest";
import { Task } from "@/types";
import { cloneBasicNostrEvents } from "@/data/basic-nostr-events";
import { nostrEventToTask, nostrEventsToTasks, mergeTasks, eventHasTags, extractAllTags, isSpamContent } from "./event-converter";
import { NostrEvent, NostrEventKind, type NostrEventWithRelay } from "./types";

function makeRelayEvent(overrides: Partial<NostrEventWithRelay> & Pick<NostrEventWithRelay, "id">): NostrEventWithRelay {
  return {
    id: overrides.id,
    pubkey: "pubkey123456789012345678901234567890",
    created_at: 1700000000,
    kind: NostrEventKind.TextNote,
    tags: [],
    content: "",
    sig: "sig",
    relayUrl: "wss://relay.test.com",
    ...overrides,
  };
}

describe("nostrEventToTask", () => {
  const baseEvent: NostrEventWithRelay = {
    id: "abc123",
    pubkey: "pubkey123456789012345678901234567890",
    created_at: 1700000000,
    kind: NostrEventKind.TextNote,
    tags: [],
    content: "Hello world",
    sig: "sig123",
    relayUrl: "wss://relay.test.com",
  };

  it("converts a basic text note to a comment task", () => {
    const task = nostrEventToTask(baseEvent);
    
    expect(task.id).toBe("abc123");
    expect(task.content).toBe("Hello world");
    expect(task.taskType).toBe("comment");
    expect(task.author.id).toBe(baseEvent.pubkey);
  });

  it("converts kind 1621 to a task", () => {
    const taskEvent: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      content: "Complete the project",
    };
    
    const task = nostrEventToTask(taskEvent);
    
    expect(task.taskType).toBe("task");
    expect(task.status).toBe("todo");
  });

  it("converts NIP-99 classified listings to feed offer messages by default", () => {
    const listingEvent: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.ClassifiedListing,
      tags: [["title", "Bike for sale"]],
      content: "Road bike, great condition",
    };

    const task = nostrEventToTask(listingEvent);

    expect(task.taskType).toBe("comment");
    expect(task.feedMessageType).toBe("offer");
  });

  it("classifies NIP-99 listings as request messages when tagged as request", () => {
    const listingEvent: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.ClassifiedListing,
      tags: [["type", "request"]],
      content: "Looking for a bike mechanic",
    };

    const task = nostrEventToTask(listingEvent);

    expect(task.taskType).toBe("comment");
    expect(task.feedMessageType).toBe("request");
  });

  it("extracts hashtags from content", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: "Working on #design and #frontend issues",
    };
    
    const task = nostrEventToTask(event);
    
    expect(task.tags).toContain("design");
    expect(task.tags).toContain("frontend");
  });

  it("extracts tags from event t tags", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      tags: [
        ["t", "urgent"],
        ["t", "Bug"],
      ],
    };
    
    const task = nostrEventToTask(event);
    
    expect(task.tags).toContain("urgent");
    expect(task.tags).toContain("bug");
  });

  it("extracts tags from event T tags case-insensitively", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      tags: [
        ["T", "backend"],
        ["t", "ops"],
      ],
    };

    const task = nostrEventToTask(event);

    expect(task.tags).toContain("backend");
    expect(task.tags).toContain("ops");
  });

  it("deduplicates tags from content and event tags", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: "Fix the #bug in the code",
      tags: [["t", "bug"]],
    };
    
    const task = nostrEventToTask(event);
    
    // Should only contain one "bug" tag
    expect(task.tags.filter((t) => t === "bug").length).toBe(1);
  });

  it("extracts status from status tag", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      tags: [["status", "done"]],
    };
    
    const task = nostrEventToTask(event);
    
    expect(task.status).toBe("done");
  });

  it("handles in-progress status", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      tags: [["status", "in-progress"]],
    };
    
    const task = nostrEventToTask(event);
    
    expect(task.status).toBe("in-progress");
  });

  it("does not force a placeholder avatar url", () => {
    const task = nostrEventToTask(baseEvent);

    expect(task.author.avatar).toBeUndefined();
  });

  it("generates display name from pubkey", () => {
    const task = nostrEventToTask(baseEvent);
    
    expect(task.author.displayName).toContain(baseEvent.pubkey.slice(0, 8));
    expect(task.author.displayName).toContain(baseEvent.pubkey.slice(-4));
  });

  it("converts timestamp correctly", () => {
    const task = nostrEventToTask(baseEvent);
    
    expect(task.timestamp.getTime()).toBe(baseEvent.created_at * 1000);
  });

  it("extracts parent ID from reply tag", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      tags: [["e", "parent123", "", "reply"]],
    };
    
    const task = nostrEventToTask(event);
    
    expect(task.parentId).toBe("parent123");
  });

  it("extracts parent ID from parent marker tag", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      tags: [["e", "parent456", "", "parent"]],
    };

    const task = nostrEventToTask(event);

    expect(task.parentId).toBe("parent456");
  });

  it("extracts relay ID from relay URL", () => {
    const task = nostrEventToTask(baseEvent);
    
    expect(task.relays).toContain("relay-test-com");
  });

  it("maps relay IDs from relayUrls when event is seen on multiple relays", () => {
    const task = nostrEventToTask({
      ...baseEvent,
      relayUrl: undefined,
      relayUrls: ["wss://relay.a/", "wss://relay.b", "wss://relay.a"],
    });

    expect(task.relays).toEqual(["relay-a", "relay-b"]);
  });

  it("extracts due date and due time from tags", () => {
    const dueSeconds = 1773964800; // 2026-03-20T00:00:00.000Z
    const event: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      tags: [
        ["due", String(dueSeconds)],
        ["due_time", "09:45"],
      ],
    };

    const task = nostrEventToTask(event);

    expect(task.dueDate?.toISOString()).toBe("2026-03-20T00:00:00.000Z");
    expect(task.dueTime).toBe("09:45");
  });

  it("extracts numeric priority from tags", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      tags: [["priority", "80"]],
    };

    const task = nostrEventToTask(event);

    expect(task.priority).toBe(80);
  });

  it("extracts mentions from person tags and @text mentions", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      kind: NostrEventKind.Task,
      content: "pair with @Alice",
      tags: [
        ["p", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
        ["P", "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"],
      ],
    };

    const task = nostrEventToTask(event);

    expect(task.mentions).toContain("alice");
    expect(task.mentions).toContain(
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    );
    expect(task.mentions).toContain(
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"
    );
    expect(task.assigneePubkeys).toEqual([
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    ]);
  });

  it("extracts imeta attachment metadata and deduplicates content URLs", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: "Screenshot: https://cdn.example.com/mock.png",
      tags: [[
        "imeta",
        "url https://cdn.example.com/mock.png",
        "m image/png",
        "x hash123",
        "size 42",
      ]],
    };

    const task = nostrEventToTask(event);

    expect(task.attachments).toEqual([
      {
        url: "https://cdn.example.com/mock.png",
        mimeType: "image/png",
        sha256: "hash123",
        size: 42,
      },
    ]);
  });

  it("creates attachment candidates from direct content URLs", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: "See https://files.example.com/report.pdf",
      tags: [],
    };

    const task = nostrEventToTask(event);

    expect(task.attachments).toEqual([
      {
        url: "https://files.example.com/report.pdf",
        mimeType: "application/pdf",
      },
    ]);
  });

  it("extracts attachments from NIP-94 top-level url tags", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: "shared file",
      tags: [
        ["url", "https://cdn.example.com/manual.pdf"],
        ["m", "application/pdf"],
        ["x", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        ["size", "9001"],
      ],
    };

    const task = nostrEventToTask(event);

    expect(task.attachments).toContainEqual({
      url: "https://cdn.example.com/manual.pdf",
      mimeType: "application/pdf",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      size: 9001,
    });
  });

  it("enriches blossom content URLs with NIP-94 hash metadata", () => {
    const sha = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: `See https://cdn.blossom.example/${sha}`,
      tags: [
        ["x", sha],
        ["m", "image/webp"],
        ["size", "321"],
      ],
    };

    const task = nostrEventToTask(event);

    expect(task.attachments).toEqual([
      {
        url: `https://cdn.blossom.example/${sha}`,
        mimeType: "image/webp",
        sha256: sha,
        size: 321,
      },
    ]);
  });

  it("resolves indexed person references from content into @pubkey mentions", () => {
    const personPubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const event: NostrEventWithRelay = {
      ...baseEvent,
      content: "Review with #[0] before merge",
      tags: [["p", personPubkey]],
    };

    const task = nostrEventToTask(event);

    expect(task.content).toBe(`Review with @${personPubkey} before merge`);
    expect(task.mentions).toContain(personPubkey);
  });

  it("extracts geohash location from g tag", () => {
    const event: NostrEventWithRelay = {
      ...baseEvent,
      tags: [["g", "u4pruyd"]],
    };

    const task = nostrEventToTask(event);
    expect(task.locationGeohash).toBe("u4pruyd");
  });
});

describe("nostrEventsToTasks", () => {
  it("converts multiple events to tasks", () => {
    const events = cloneBasicNostrEvents();
    
    const tasks = nostrEventsToTasks(events);
    
    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe(events[0].id);
    expect(tasks[1].id).toBe(events[1].id);
    expect(tasks[2].id).toBe(events[2].id);
    expect(tasks[2].feedMessageType).toBe("request");
  });

  it("applies latest state-event update to task status", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({ id: "task-1", pubkey: "pub1", kind: NostrEventKind.Task, content: "Implement feature", sig: "sig1" }),
      makeRelayEvent({
        id: "state-old",
        pubkey: "pub1",
        created_at: 1700000001,
        kind: NostrEventKind.GitStatusApplied,
        tags: [["e", "task-1", "", "property"]],
        content: "",
        sig: "sig2",
      }),
      makeRelayEvent({
        id: "state-new",
        pubkey: "pub1",
        created_at: 1700000002,
        kind: NostrEventKind.GitStatusOpen,
        tags: [["e", "task-1", "", "property"]],
        content: "In Progress",
        sig: "sig3",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("in-progress");
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000002 * 1000);
    expect(tasks[0].stateUpdates).toEqual([
      expect.objectContaining({
        id: "state-new",
        status: "in-progress",
        statusDescription: "In Progress",
      }),
      expect.objectContaining({
        id: "state-old",
        status: "done",
      }),
    ]);
  });

  it("preserves closed state updates separately from done", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "task-closed",
        pubkey: "pub1",
        kind: NostrEventKind.Task,
        content: "Close without applying",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "state-closed",
        pubkey: "pub1",
        created_at: 1700000005,
        kind: NostrEventKind.GitStatusClosed,
        tags: [["e", "task-closed", "", "property"]],
        content: "",
        sig: "sig2",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("closed");
    expect(tasks[0].stateUpdates).toEqual([
      expect.objectContaining({
        id: "state-closed",
        status: "closed",
      }),
    ]);
  });

  it("ignores unauthorized state-event updates on assigned tasks", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "task-assigned",
        pubkey: "creator-pubkey",
        created_at: 1700000000,
        kind: NostrEventKind.Task,
        tags: [["p", "assignee-pubkey"]],
        content: "Assigned task",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "state-unauthorized",
        pubkey: "intruder-pubkey",
        created_at: 1700000005,
        kind: NostrEventKind.GitStatusApplied,
        tags: [["e", "task-assigned", "", "property"]],
        content: "",
        sig: "sig2",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("todo");
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000000 * 1000);
    expect(tasks[0].stateUpdates).toBeUndefined();
  });

  it("applies assignee-authored state updates on assigned tasks", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "task-assigned-allowed",
        pubkey: "creator-pubkey",
        created_at: 1700000010,
        kind: NostrEventKind.Task,
        tags: [["p", "assignee-pubkey"]],
        content: "Assigned task",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "state-assignee",
        pubkey: "assignee-pubkey",
        created_at: 1700000015,
        kind: NostrEventKind.GitStatusApplied,
        tags: [["e", "task-assigned-allowed", "", "property"]],
        content: "",
        sig: "sig2",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("done");
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000015 * 1000);
    expect(tasks[0].stateUpdates).toEqual([
      expect.objectContaining({
        id: "state-assignee",
        status: "done",
        authorPubkey: "assignee-pubkey",
      }),
    ]);
  });

  it("hydrates task due date/time from linked calendar events", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({ id: "task-2", pubkey: "pub1", kind: NostrEventKind.Task, content: "Release", sig: "sig1" }),
      makeRelayEvent({
        id: "cal-1",
        pubkey: "pub1",
        created_at: 1700000003,
        kind: NostrEventKind.CalendarDateBased,
        tags: [["d", "deadline-1"], ["title", "Release"], ["start", "2026-03-23"], ["e", "task-2", "", "task"]],
        content: "Release",
        sig: "sig2",
      }),
      makeRelayEvent({
        id: "cal-2",
        pubkey: "pub1",
        created_at: 1700000004,
        kind: NostrEventKind.CalendarTimeBased,
        tags: [["d", "deadline-2"], ["title", "Release"], ["start", "1774276200"], ["due_time", "14:30"], ["e", "task-2", "", "task"]],
        content: "Release",
        sig: "sig3",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate?.toISOString()).toBe("2026-03-23T14:30:00.000Z");
    expect(tasks[0].dueTime).toBe("14:30");
  });

  it("ignores unauthorized due-date and priority updates on assigned tasks", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "task-assigned-properties",
        pubkey: "creator-pubkey",
        created_at: 1700000020,
        kind: NostrEventKind.Task,
        tags: [["p", "assignee-pubkey"], ["priority", "20"]],
        content: "Assigned task",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "cal-unauthorized",
        pubkey: "intruder-pubkey",
        created_at: 1700000025,
        kind: NostrEventKind.CalendarDateBased,
        tags: [["d", "deadline-1"], ["title", "Assigned task"], ["start", "2026-03-30"], ["e", "task-assigned-properties", "", "task"]],
        content: "Assigned task",
        sig: "sig2",
      }),
      makeRelayEvent({
        id: "prio-unauthorized",
        pubkey: "intruder-pubkey",
        created_at: 1700000030,
        kind: NostrEventKind.TextNote,
        tags: [["e", "task-assigned-properties", "", "property"], ["priority", "90"]],
        content: "Priority: 90",
        sig: "sig3",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate).toBeUndefined();
    expect(tasks[0].priority).toBe(20);
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000020 * 1000);
  });

  it("hydrates latest priority from property update notes and does not render them as tasks", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "task-priority",
        pubkey: "pub1",
        kind: NostrEventKind.Task,
        tags: [["priority", "20"]],
        content: "Prioritized task",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "prio-update-old",
        pubkey: "pub1",
        created_at: 1700000010,
        kind: NostrEventKind.TextNote,
        tags: [["e", "task-priority", "", "property"], ["priority", "40"]],
        content: "Priority: 40",
        sig: "sig2",
      }),
      makeRelayEvent({
        id: "prio-update-new",
        pubkey: "pub1",
        created_at: 1700000020,
        kind: NostrEventKind.TextNote,
        tags: [["e", "task-priority", "", "property"], ["priority", "90"]],
        content: "Priority: 90",
        sig: "sig3",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-priority");
    expect(tasks[0].priority).toBe(90);
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000020 * 1000);
  });

  it("hydrates priority from state events carrying priority property tags", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "task-priority-state",
        pubkey: "pub1",
        created_at: 1700000100,
        kind: NostrEventKind.Task,
        tags: [["priority", "20"]],
        content: "State-priority task",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "state-update-priority",
        pubkey: "pub1",
        created_at: 1700000110,
        kind: NostrEventKind.GitStatusOpen,
        tags: [["e", "task-priority-state", "", "property"], ["priority", "70"]],
        content: "In Progress",
        sig: "sig2",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-priority-state");
    expect(tasks[0].priority).toBe(70);
    expect(tasks[0].status).toBe("in-progress");
  });

  it("keeps only latest parameterized replaceable listing revision", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "listing-old",
        pubkey: "pub-listing",
        created_at: 1700000200,
        kind: NostrEventKind.ClassifiedListing,
        tags: [["d", "listing-1"], ["status", "active"]],
        content: "Old listing",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "listing-new",
        pubkey: "pub-listing",
        created_at: 1700000300,
        kind: NostrEventKind.ClassifiedListing,
        tags: [["d", "listing-1"], ["status", "sold"]],
        content: "New listing",
        sig: "sig2",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("listing-new");
    expect(tasks[0].nip99?.status).toBe("sold");
  });

  it("discards invalid parameterized replaceable events missing d", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "listing-invalid",
        pubkey: "pub-listing",
        created_at: 1700000200,
        kind: NostrEventKind.ClassifiedListing,
        tags: [["status", "active"]],
        content: "Invalid listing",
        sig: "sig1",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toEqual([]);
  });

  it("breaks replaceable listing timestamp ties with lexical event id", () => {
    const events: NostrEventWithRelay[] = [
      makeRelayEvent({
        id: "listing-a",
        pubkey: "pub-listing",
        created_at: 1700000400,
        kind: NostrEventKind.ClassifiedListing,
        tags: [["d", "listing-tie"]],
        content: "Older lexical id",
        sig: "sig1",
      }),
      makeRelayEvent({
        id: "listing-b",
        pubkey: "pub-listing",
        created_at: 1700000400,
        kind: NostrEventKind.ClassifiedListing,
        tags: [["d", "listing-tie"]],
        content: "Newer lexical id",
        sig: "sig2",
      }),
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("listing-b");
  });
});

describe("mergeTasks", () => {
  it("merges tasks without duplicates", () => {
    const existing = [
      { id: "1", timestamp: new Date(1000) },
      { id: "2", timestamp: new Date(2000) },
    ] as Pick<Task, "id" | "timestamp">[];
    
    const newTasks = [
      { id: "2", timestamp: new Date(2000) },
      { id: "3", timestamp: new Date(3000) },
    ] as Pick<Task, "id" | "timestamp">[];
    
    const merged = mergeTasks(existing as Task[], newTasks as Task[]);
    
    expect(merged).toHaveLength(3);
    expect(merged.map((t) => t.id)).toContain("1");
    expect(merged.map((t) => t.id)).toContain("2");
    expect(merged.map((t) => t.id)).toContain("3");
  });

  it("sorts merged tasks by timestamp descending", () => {
    const existing = [
      { id: "1", timestamp: new Date(1000) },
    ] as Pick<Task, "id" | "timestamp">[];
    
    const newTasks = [
      { id: "2", timestamp: new Date(3000) },
      { id: "3", timestamp: new Date(2000) },
    ] as Pick<Task, "id" | "timestamp">[];
    
    const merged = mergeTasks(existing as Task[], newTasks as Task[]);
    
    expect(merged[0].id).toBe("2"); // Most recent first
    expect(merged[1].id).toBe("3");
    expect(merged[2].id).toBe("1");
  });

  it("merges relay ids when duplicate task ids are merged", () => {
    const existing = [
      { id: "same", relays: ["relay-a"], timestamp: new Date(1000) },
    ] as Pick<Task, "id" | "relays" | "timestamp">[] as Task[];
    const incoming = [
      { id: "same", relays: ["relay-b"], timestamp: new Date(2000) },
    ] as Pick<Task, "id" | "relays" | "timestamp">[] as Task[];

    const merged = mergeTasks(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].relays).toEqual(["relay-a", "relay-b"]);
  });
});

describe("eventHasTags", () => {
  const baseEvent: NostrEvent = {
    id: "abc123",
    pubkey: "pubkey123",
    created_at: 1700000000,
    kind: NostrEventKind.TextNote,
    tags: [],
    content: "Hello world",
    sig: "sig123",
  };

  it("returns true for event with t tags", () => {
    const event: NostrEvent = {
      ...baseEvent,
      tags: [["t", "design"]],
    };
    
    expect(eventHasTags(event)).toBe(true);
  });

  it("returns true for event with hashtags in content", () => {
    const event: NostrEvent = {
      ...baseEvent,
      content: "Working on #frontend",
    };
    
    expect(eventHasTags(event)).toBe(true);
  });

  it("returns false for event without any tags", () => {
    expect(eventHasTags(baseEvent)).toBe(false);
  });

  it("returns false for event with empty t tag", () => {
    const event: NostrEvent = {
      ...baseEvent,
      tags: [["t", ""]],
    };
    
    expect(eventHasTags(event)).toBe(false);
  });
});

describe("extractAllTags", () => {
  const baseEvent: NostrEvent = {
    id: "abc123",
    pubkey: "pubkey123",
    created_at: 1700000000,
    kind: NostrEventKind.TextNote,
    tags: [],
    content: "Hello world",
    sig: "sig123",
  };

  it("extracts tags from multiple events", () => {
    const events: NostrEvent[] = [
      { ...baseEvent, tags: [["t", "design"]] },
      { ...baseEvent, tags: [["t", "frontend"]] },
    ];
    
    const tags = extractAllTags(events);
    
    expect(tags).toContain("design");
    expect(tags).toContain("frontend");
  });

  it("deduplicates tags across events", () => {
    const events: NostrEvent[] = [
      { ...baseEvent, tags: [["t", "design"]] },
      { ...baseEvent, tags: [["t", "design"]] },
    ];
    
    const tags = extractAllTags(events);
    
    expect(tags.filter(t => t === "design")).toHaveLength(1);
  });

  it("extracts hashtags from content", () => {
    const events: NostrEvent[] = [
      { ...baseEvent, content: "Working on #backend" },
    ];
    
    const tags = extractAllTags(events);
    
    expect(tags).toContain("backend");
  });

  it("returns sorted tags", () => {
    const events: NostrEvent[] = [
      { ...baseEvent, tags: [["t", "zebra"], ["t", "alpha"]] },
    ];
    
    const tags = extractAllTags(events);
    
    expect(tags[0]).toBe("alpha");
    expect(tags[1]).toBe("zebra");
  });
});

describe("isSpamContent", () => {
  it("detects sexual content", () => {
    expect(isSpamContent("Check out my onlyfans")).toBe(true);
    expect(isSpamContent("NSFW content here")).toBe(true);
    expect(isSpamContent("Adult content 18+")).toBe(true);
  });

  it("detects spam patterns", () => {
    expect(isSpamContent("Free bitcoin giveaway")).toBe(true);
    expect(isSpamContent("DM me for details")).toBe(true);
    expect(isSpamContent("Click here now")).toBe(true);
    expect(isSpamContent("Follow me for follow back")).toBe(true);
  });

  it("does not flag normal content", () => {
    expect(isSpamContent("Working on #design today")).toBe(false);
    expect(isSpamContent("Just finished a great project")).toBe(false);
    expect(isSpamContent("Meeting at 3pm to discuss roadmap")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isSpamContent("FREE BITCOIN")).toBe(true);
    expect(isSpamContent("OnlyFans")).toBe(true);
  });
});
