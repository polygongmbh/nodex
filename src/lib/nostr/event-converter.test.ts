import { describe, it, expect } from "vitest";
import { Task } from "@/types";
import { nostrEventToTask, nostrEventsToTasks, mergeTasks, eventHasTags, extractAllTags, isSpamContent } from "./event-converter";
import { NostrEvent, NostrEventKind } from "./types";
import type { NostrEventWithRelay } from "./relay-pool";

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
});

describe("nostrEventsToTasks", () => {
  it("converts multiple events to tasks", () => {
    const events: NostrEventWithRelay[] = [
      {
        id: "1",
        pubkey: "pub1",
        created_at: 1700000000,
        kind: NostrEventKind.TextNote,
        tags: [],
        content: "First",
        sig: "sig1",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "2",
        pubkey: "pub2",
        created_at: 1700000001,
        kind: NostrEventKind.Task,
        tags: [],
        content: "Second",
        sig: "sig2",
        relayUrl: "wss://relay.test.com",
      },
    ];
    
    const tasks = nostrEventsToTasks(events);
    
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe("1");
    expect(tasks[1].id).toBe("2");
  });

  it("applies latest state-event update to task status", () => {
    const events: NostrEventWithRelay[] = [
      {
        id: "task-1",
        pubkey: "pub1",
        created_at: 1700000000,
        kind: NostrEventKind.Task,
        tags: [],
        content: "Implement feature",
        sig: "sig1",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "state-old",
        pubkey: "pub1",
        created_at: 1700000001,
        kind: NostrEventKind.GitStatusApplied,
        tags: [["e", "task-1", "", "property"]],
        content: "",
        sig: "sig2",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "state-new",
        pubkey: "pub1",
        created_at: 1700000002,
        kind: NostrEventKind.GitStatusOpen,
        tags: [["e", "task-1", "", "property"]],
        content: "In Progress",
        sig: "sig3",
        relayUrl: "wss://relay.test.com",
      },
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("in-progress");
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000002 * 1000);
  });

  it("hydrates task due date/time from linked calendar events", () => {
    const events: NostrEventWithRelay[] = [
      {
        id: "task-2",
        pubkey: "pub1",
        created_at: 1700000000,
        kind: NostrEventKind.Task,
        tags: [],
        content: "Release",
        sig: "sig1",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "cal-1",
        pubkey: "pub1",
        created_at: 1700000003,
        kind: NostrEventKind.CalendarDateBased,
        tags: [
          ["d", "deadline-1"],
          ["title", "Release"],
          ["start", "2026-03-23"],
          ["e", "task-2", "", "task"],
        ],
        content: "Release",
        sig: "sig2",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "cal-2",
        pubkey: "pub1",
        created_at: 1700000004,
        kind: NostrEventKind.CalendarTimeBased,
        tags: [
          ["d", "deadline-2"],
          ["title", "Release"],
          ["start", "1774276200"],
          ["due_time", "14:30"],
          ["e", "task-2", "", "task"],
        ],
        content: "Release",
        sig: "sig3",
        relayUrl: "wss://relay.test.com",
      },
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate?.toISOString()).toBe("2026-03-23T14:30:00.000Z");
    expect(tasks[0].dueTime).toBe("14:30");
  });

  it("hydrates latest priority from property update notes and does not render them as tasks", () => {
    const events: NostrEventWithRelay[] = [
      {
        id: "task-priority",
        pubkey: "pub1",
        created_at: 1700000000,
        kind: NostrEventKind.Task,
        tags: [["priority", "20"]],
        content: "Prioritized task",
        sig: "sig1",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "prio-update-old",
        pubkey: "pub1",
        created_at: 1700000010,
        kind: NostrEventKind.TextNote,
        tags: [
          ["e", "task-priority", "", "property"],
          ["priority", "40"],
        ],
        content: "Priority: 40",
        sig: "sig2",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "prio-update-new",
        pubkey: "pub1",
        created_at: 1700000020,
        kind: NostrEventKind.TextNote,
        tags: [
          ["e", "task-priority", "", "property"],
          ["priority", "90"],
        ],
        content: "Priority: 90",
        sig: "sig3",
        relayUrl: "wss://relay.test.com",
      },
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-priority");
    expect(tasks[0].priority).toBe(90);
    expect(tasks[0].lastEditedAt?.getTime()).toBe(1700000020 * 1000);
  });

  it("hydrates priority from state events carrying priority property tags", () => {
    const events: NostrEventWithRelay[] = [
      {
        id: "task-priority-state",
        pubkey: "pub1",
        created_at: 1700000100,
        kind: NostrEventKind.Task,
        tags: [["priority", "20"]],
        content: "State-priority task",
        sig: "sig1",
        relayUrl: "wss://relay.test.com",
      },
      {
        id: "state-update-priority",
        pubkey: "pub1",
        created_at: 1700000110,
        kind: NostrEventKind.GitStatusOpen,
        tags: [
          ["e", "task-priority-state", "", "property"],
          ["priority", "70"],
        ],
        content: "In Progress",
        sig: "sig2",
        relayUrl: "wss://relay.test.com",
      },
    ];

    const tasks = nostrEventsToTasks(events);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-priority-state");
    expect(tasks[0].priority).toBe(70);
    expect(tasks[0].status).toBe("in-progress");
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
    
    const merged = mergeTasks(existing, newTasks);
    
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
    
    const merged = mergeTasks(existing, newTasks);
    
    expect(merged[0].id).toBe("2"); // Most recent first
    expect(merged[1].id).toBe("3");
    expect(merged[2].id).toBe("1");
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
