import { Relay, Channel, Task, TaskStatus } from "@/types";
import type { Person } from "@/types/person";
import { addDays, subDays } from "date-fns";
import { NostrEventKind } from "@/lib/nostr/types";
import { DEMO_RELAY_URL } from "./basic-nostr-events";

const today = new Date();

// NIP-01 compliant mock pubkeys (32 bytes = 64 hex chars)
const MOCK_PUBKEYS = {
  me: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  alice: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
  bob: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  carol: "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
  david: "e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
};

export const mockRelays: Relay[] = [
  { id: "demo", name: "Demo", isActive: true, url: DEMO_RELAY_URL },
];

export const mockChannels: Channel[] = [
  { id: "urgent", name: "urgent", filterState: "neutral" },
  { id: "design", name: "design", filterState: "neutral" },
  { id: "backend", name: "backend", filterState: "neutral" },
  { id: "frontend", name: "frontend", filterState: "neutral" },
  { id: "bug", name: "bug", filterState: "neutral" },
  { id: "feature", name: "feature", filterState: "neutral" },
  { id: "docs", name: "docs", filterState: "neutral" },
  { id: "review", name: "review", filterState: "neutral" },
  { id: "blocked", name: "blocked", filterState: "neutral" },
  { id: "planning", name: "planning", filterState: "neutral" },
];

// Legacy alias
export const mockTags = mockChannels;

export const mockPeople: Person[] = [
  { id: MOCK_PUBKEYS.me, name: "me", displayName: "Local User", isOnline: true, isSelected: false },
  { id: MOCK_PUBKEYS.alice, name: "alice", displayName: "Alice Chen", isOnline: true, isSelected: false },
  { id: MOCK_PUBKEYS.bob, name: "bob", displayName: "Bob Smith", isOnline: false, isSelected: false },
  { id: MOCK_PUBKEYS.carol, name: "carol", displayName: "Carol Davis", isOnline: true, isSelected: false },
  { id: MOCK_PUBKEYS.david, name: "david", displayName: "David Kim", isOnline: false, isSelected: false },
];

export const mockKind0Events = mockPeople.map((person, index) => ({
  kind: NostrEventKind.Metadata,
  pubkey: person.id,
  created_at: Math.floor(Date.now() / 1000) - index,
  content: JSON.stringify({
    name: person.name,
    displayName: person.displayName,
    picture: person.avatar,
    nip05: person.nip05,
    about: person.about,
  }),
}));

// Counter for generating unique event IDs
let eventCounter = 0;

/**
 * Generate a NIP-01 compliant mock event ID (32 bytes = 64 hex chars)
 * In production, this would be SHA256 of serialized event data
 */
function generateMockEventId(): string {
  eventCounter++;
  const base = `demo${eventCounter.toString().padStart(8, "0")}`;
  // Pad to 64 chars with deterministic hex
  return base.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").padEnd(64, "0").slice(0, 64);
}

// Helper to create mock task with NIP-01 compliant nostr structure
// Uses kind 1621 for tasks per task event proposals
// Tags follow NIP-01: ["t", "tagname"] for hashtags, ["e", "eventid", "", "reply"] for replies
function createTask(
  author: Person,
  content: string,
  tags: string[],
  options: {
    parentId?: string;
    status?: TaskStatus;
    completedBy?: string;
    dueDate?: Date;
    dueTime?: string;
    timestamp?: Date;
    likes?: number;
    replies?: number;
    reposts?: number;
  } = {}
): Task {
  return {
    id: generateMockEventId(),
    author,
    content,
    tags,
    relays: ["demo"],
    taskType: "task",
    timestamp: options.timestamp || new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 14),
    lastEditedAt: options.timestamp || new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 14),
    likes: options.likes || 0,
    replies: options.replies || 0,
    reposts: options.reposts || 0,
    status: options.status,
    completedBy: options.completedBy,
    dueDate: options.dueDate,
    dueTime: options.dueTime,
    parentId: options.parentId,
  };
}

// Helper to create mock comment (kind 1 text note with reply reference per NIP-01)
function createComment(
  author: Person,
  content: string,
  tags: string[],
  options: {
    parentId?: string;
    timestamp?: Date;
    likes?: number;
    replies?: number;
    reposts?: number;
  } = {}
): Task {
  return {
    id: generateMockEventId(),
    author,
    content,
    tags,
    relays: ["demo"],
    taskType: "comment",
    timestamp: options.timestamp || new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 7),
    lastEditedAt: options.timestamp || new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 7),
    likes: options.likes || 0,
    replies: options.replies || 0,
    reposts: options.reposts || 0,
    parentId: options.parentId,
  };
}

// Create tasks with proper NIP-01 structure
// Root task: Website Redesign
const task1 = createTask(mockPeople[1], "Website Redesign Project - Complete overhaul of the company website #design #frontend", ["design", "frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  likes: 12,
  replies: 5,
  reposts: 2,
  dueDate: addDays(today, 1),
});

// Subtasks of Website Redesign (using parentId as nostr "e" tag reference per NIP-01)
const task1a = createTask(mockPeople[2], "Create wireframes for homepage and landing pages #design", ["design"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6),
  likes: 5,
  replies: 2,
  parentId: task1.id,
  status: "done",
  completedBy: MOCK_PUBKEYS.bob,
  dueDate: subDays(today, 2),
});

const task1b = createTask(mockPeople[3], "Implement responsive navigation component #frontend", ["frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
  likes: 3,
  replies: 1,
  parentId: task1.id,
  status: "in-progress",
  dueDate: today,
  dueTime: "14:00",
});

const task1b1 = createTask(mockPeople[4], "Add mobile hamburger menu #frontend", ["frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
  likes: 1,
  parentId: task1b.id,
  dueDate: today,
});

const task1b2 = createTask(mockPeople[1], "Add keyboard navigation support #frontend", ["frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
  likes: 2,
  parentId: task1b.id,
  status: "done",
  completedBy: MOCK_PUBKEYS.alice,
});

// Comment on navigation task (kind 1 text note with "e" tag reply per NIP-01)
const comment1bc1 = createComment(mockPeople[2], "Should we use CSS Grid or Flexbox for the layout? #frontend", ["frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
  likes: 2,
  replies: 1,
  parentId: task1b.id,
});

const task1c = createTask(mockPeople[1], "Set up design system with color tokens #design #docs", ["design", "docs"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
  likes: 8,
  replies: 3,
  reposts: 1,
  parentId: task1.id,
  dueDate: addDays(today, 3),
});

// Root task: API Development
const task2 = createTask(mockPeople[3], "API Development - Build REST API for mobile app #backend #feature", ["backend", "feature"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
  likes: 15,
  replies: 8,
  reposts: 3,
  dueDate: subDays(today, 1),
});

const task2a = createTask(mockPeople[4], "Design database schema #backend #planning", ["backend", "planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9),
  likes: 6,
  replies: 2,
  parentId: task2.id,
  status: "done",
  completedBy: MOCK_PUBKEYS.david,
  dueDate: subDays(today, 5),
});

const task2b = createTask(mockPeople[1], "Implement authentication endpoints #backend #urgent", ["backend", "urgent"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
  likes: 4,
  replies: 1,
  parentId: task2.id,
  dueDate: today,
  dueTime: "17:00",
});

const task2b1 = createTask(mockPeople[2], "Add JWT token refresh logic #backend", ["backend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  likes: 2,
  parentId: task2b.id,
  dueDate: addDays(today, 1),
});

// Comment on auth (NIP-01 kind 1 with "e" tag)
const comment2bc1 = createComment(mockPeople[3], "We should consider using refresh tokens with short-lived access tokens for better security. #backend", ["backend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  likes: 5,
  parentId: task2b.id,
});

const task2c = createTask(mockPeople[3], "Write API documentation #docs", ["docs"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6),
  likes: 3,
  parentId: task2.id,
  dueDate: addDays(today, 5),
});

// Root task: Bug Fixes
const task3 = createTask(mockPeople[2], "Bug Fixes - Address critical issues before release #bug #urgent", ["bug", "urgent"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
  likes: 7,
  replies: 4,
  reposts: 1,
  dueDate: today,
  dueTime: "18:00",
});

const task3a = createTask(mockPeople[4], "Fix login redirect loop on mobile Safari #bug #frontend", ["bug", "frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
  likes: 3,
  replies: 2,
  parentId: task3.id,
  status: "in-progress",
  dueDate: today,
});

const task3b = createTask(mockPeople[1], "Resolve memory leak in dashboard component #bug #frontend", ["bug", "frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
  likes: 5,
  replies: 1,
  parentId: task3.id,
  status: "done",
  completedBy: MOCK_PUBKEYS.alice,
  dueDate: subDays(today, 1),
});

// Personal tasks
const task4 = createTask(mockPeople[0], "Home Renovation Planning #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
  replies: 2,
});

const task4a = createTask(mockPeople[0], "Get quotes from contractors #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 13),
  parentId: task4.id,
  dueDate: addDays(today, 7),
});

const task4b = createTask(mockPeople[0], "Research kitchen cabinet styles #design", ["design"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
  parentId: task4.id,
  status: "done",
  completedBy: MOCK_PUBKEYS.me,
});

// Personal productivity
const task5 = createTask(mockPeople[0], "Weekly Review Tasks #review", ["review"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
  replies: 3,
  dueDate: addDays(today, 2),
});

const task5a = createTask(mockPeople[0], "Review completed tasks from last week #review", ["review"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
  parentId: task5.id,
  dueDate: addDays(today, 2),
});

const task5b = createTask(mockPeople[0], "Plan priorities for next week #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60),
  parentId: task5.id,
  dueDate: addDays(today, 2),
});

// Additional tasks
const task6 = createTask(mockPeople[2], "Q1 Planning Meeting Prep #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
  likes: 2,
  replies: 1,
  dueDate: addDays(today, 4),
});

const task6a = createTask(mockPeople[2], "Gather team input on priorities #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60),
  parentId: task6.id,
  dueDate: addDays(today, 2),
});

const task6b = createTask(mockPeople[2], "Create presentation slides #docs", ["docs"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 30),
  parentId: task6.id,
  dueDate: addDays(today, 3),
});

// Top-level tasks without subtasks
const task7 = createTask(mockPeople[1], "Schedule team offsite meeting #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
  likes: 3,
  dueDate: addDays(today, 6),
});

const task8 = createTask(mockPeople[3], "Update project dependencies to latest versions #backend #frontend", ["backend", "frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12),
  likes: 2,
  replies: 1,
  status: "in-progress",
});

const task9 = createTask(mockPeople[0], "Buy groceries for the week #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
  dueDate: today,
});

const task10 = createTask(mockPeople[4], "Prepare monthly expense report #docs #review", ["docs", "review"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
  likes: 1,
  dueDate: addDays(today, 1),
  status: "done",
  completedBy: MOCK_PUBKEYS.david,
});

const task11 = createTask(mockPeople[2], "Clean up old branches in repository #backend", ["backend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
  likes: 4,
  replies: 2,
});

// Top-level comments (general discussions - kind 1 text notes per NIP-01)
const commentC1 = createComment(mockPeople[1], "Has anyone looked into the new React 19 features? Wondering if we should plan an upgrade. #frontend", ["frontend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
  likes: 8,
  replies: 4,
  reposts: 1,
});

const commentC2 = createComment(mockPeople[3], "Reminder: Please update your timesheets before end of day Friday! #review", ["review"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
  likes: 2,
});

const commentC3 = createComment(mockPeople[0], "Great progress on the website redesign this week, team! 🎉 #design", ["design"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 30),
  likes: 15,
  replies: 3,
  reposts: 2,
});

const commentC4 = createComment(mockPeople[4], "Anyone interested in a lunch run today? Meeting at the lobby at noon. #planning", ["planning"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
  likes: 5,
  replies: 2,
});

const commentC5 = createComment(mockPeople[2], "FYI: The staging server will be down for maintenance tonight from 10pm-12am. #backend", ["backend"], {
  timestamp: new Date(Date.now() - 1000 * 60 * 45),
  likes: 7,
  replies: 1,
});

export const mockTasks: Task[] = [
  task1, task1a, task1b, task1b1, task1b2, comment1bc1, task1c,
  task2, task2a, task2b, task2b1, comment2bc1, task2c,
  task3, task3a, task3b,
  task4, task4a, task4b,
  task5, task5a, task5b,
  task6, task6a, task6b,
  task7, task8, task9, task10, task11,
  commentC1, commentC2, commentC3, commentC4, commentC5,
];

// Legacy export for compatibility
export const mockPosts = mockTasks;
