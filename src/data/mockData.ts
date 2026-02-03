import { Relay, Channel, Person, Task } from "@/types";
import { addDays, subDays } from "date-fns";

const today = new Date();

export const mockRelays: Relay[] = [
  { id: "demo", name: "Demo", icon: "play-circle", isActive: true, postCount: 42 },
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
  { id: "me", name: "me", displayName: "You", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=You", isOnline: true, isSelected: false },
  { id: "alice", name: "alice", displayName: "Alice Chen", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice", isOnline: true, isSelected: false },
  { id: "bob", name: "bob", displayName: "Bob Smith", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bob", isOnline: false, isSelected: false },
  { id: "carol", name: "carol", displayName: "Carol Davis", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Carol", isOnline: true, isSelected: false },
  { id: "david", name: "david", displayName: "David Kim", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=David", isOnline: false, isSelected: false },
];

// Helper to create mock task with nostr-compliant structure
// Uses kind 1621 for tasks per NIP proposal for task events
// Tags follow nostr conventions: ["t", "tagname"] for hashtags, ["e", "eventid", "", "reply"] for replies
function createTask(
  id: string,
  author: Person,
  content: string,
  tags: string[],
  options: {
    parentId?: string;
    status?: "todo" | "in-progress" | "done";
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
    id,
    author,
    content,
    tags,
    relays: ["demo"],
    taskType: "task",
    timestamp: options.timestamp || new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 14),
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

// Helper to create mock comment (kind 1 text note with reply reference)
function createComment(
  id: string,
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
    id,
    author,
    content,
    tags,
    relays: ["demo"],
    taskType: "comment",
    timestamp: options.timestamp || new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 7),
    likes: options.likes || 0,
    replies: options.replies || 0,
    reposts: options.reposts || 0,
    parentId: options.parentId,
  };
}

export const mockTasks: Task[] = [
  // Root task: Website Redesign - DUE TOMORROW
  createTask("1", mockPeople[1], "Website Redesign Project - Complete overhaul of the company website #design #frontend", ["design", "frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    likes: 12,
    replies: 5,
    reposts: 2,
    dueDate: addDays(today, 1),
  }),
  // Subtasks of Website Redesign (using parentId as nostr "e" tag reference)
  createTask("1a", mockPeople[2], "Create wireframes for homepage and landing pages #design", ["design"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6),
    likes: 5,
    replies: 2,
    parentId: "1",
    status: "done",
    completedBy: "bob",
    dueDate: subDays(today, 2),
  }),
  createTask("1b", mockPeople[3], "Implement responsive navigation component #frontend", ["frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    likes: 3,
    replies: 1,
    parentId: "1",
    status: "in-progress",
    dueDate: today,
    dueTime: "14:00",
  }),
  createTask("1b1", mockPeople[4], "Add mobile hamburger menu #frontend", ["frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    likes: 1,
    parentId: "1b",
    dueDate: today,
  }),
  createTask("1b2", mockPeople[1], "Add keyboard navigation support #frontend", ["frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    likes: 2,
    parentId: "1b",
    status: "done",
    completedBy: "alice",
  }),
  // Comment on navigation task (kind 1 text note with reply)
  createComment("1bc1", mockPeople[2], "Should we use CSS Grid or Flexbox for the layout? #frontend", ["frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    likes: 2,
    replies: 1,
    parentId: "1b",
  }),
  createTask("1c", mockPeople[1], "Set up design system with color tokens #design #docs", ["design", "docs"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    likes: 8,
    replies: 3,
    reposts: 1,
    parentId: "1",
    dueDate: addDays(today, 3),
  }),

  // Root task: API Development - OVERDUE
  createTask("2", mockPeople[3], "API Development - Build REST API for mobile app #backend #feature", ["backend", "feature"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
    likes: 15,
    replies: 8,
    reposts: 3,
    dueDate: subDays(today, 1),
  }),
  createTask("2a", mockPeople[4], "Design database schema #backend #planning", ["backend", "planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9),
    likes: 6,
    replies: 2,
    parentId: "2",
    status: "done",
    completedBy: "david",
    dueDate: subDays(today, 5),
  }),
  createTask("2b", mockPeople[1], "Implement authentication endpoints #backend #urgent", ["backend", "urgent"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8),
    likes: 4,
    replies: 1,
    parentId: "2",
    dueDate: today,
    dueTime: "17:00",
  }),
  createTask("2b1", mockPeople[2], "Add JWT token refresh logic #backend", ["backend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    likes: 2,
    parentId: "2b",
    dueDate: addDays(today, 1),
  }),
  // Comment on auth
  createComment("2bc1", mockPeople[3], "We should consider using refresh tokens with short-lived access tokens for better security. #backend", ["backend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    likes: 5,
    parentId: "2b",
  }),
  createTask("2c", mockPeople[3], "Write API documentation #docs", ["docs"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6),
    likes: 3,
    parentId: "2",
    dueDate: addDays(today, 5),
  }),

  // Root task: Bug Fixes - DUE TODAY
  createTask("3", mockPeople[2], "Bug Fixes - Address critical issues before release #bug #urgent", ["bug", "urgent"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    likes: 7,
    replies: 4,
    reposts: 1,
    dueDate: today,
    dueTime: "18:00",
  }),
  createTask("3a", mockPeople[4], "Fix login redirect loop on mobile Safari #bug #frontend", ["bug", "frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    likes: 3,
    replies: 2,
    parentId: "3",
    status: "in-progress",
    dueDate: today,
  }),
  createTask("3b", mockPeople[1], "Resolve memory leak in dashboard component #bug #frontend", ["bug", "frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
    likes: 5,
    replies: 1,
    parentId: "3",
    status: "done",
    completedBy: "alice",
    dueDate: subDays(today, 1),
  }),

  // Personal tasks - NO DEADLINE
  createTask("4", mockPeople[0], "Home Renovation Planning #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
    replies: 2,
  }),
  createTask("4a", mockPeople[0], "Get quotes from contractors #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 13),
    parentId: "4",
    dueDate: addDays(today, 7),
  }),
  createTask("4b", mockPeople[0], "Research kitchen cabinet styles #design", ["design"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12),
    parentId: "4",
    status: "done",
    completedBy: "me",
  }),

  // Personal productivity - NEXT WEEK
  createTask("5", mockPeople[0], "Weekly Review Tasks #review", ["review"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    replies: 3,
    dueDate: addDays(today, 2),
  }),
  createTask("5a", mockPeople[0], "Review completed tasks from last week #review", ["review"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
    parentId: "5",
    dueDate: addDays(today, 2),
  }),
  createTask("5b", mockPeople[0], "Plan priorities for next week #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    parentId: "5",
    dueDate: addDays(today, 2),
  }),

  // Additional tasks for demo
  createTask("6", mockPeople[2], "Q1 Planning Meeting Prep #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    likes: 2,
    replies: 1,
    dueDate: addDays(today, 4),
  }),
  createTask("6a", mockPeople[2], "Gather team input on priorities #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    parentId: "6",
    dueDate: addDays(today, 2),
  }),
  createTask("6b", mockPeople[2], "Create presentation slides #docs", ["docs"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    parentId: "6",
    dueDate: addDays(today, 3),
  }),

  // Top-level tasks without subtasks
  createTask("7", mockPeople[1], "Schedule team offsite meeting #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    likes: 3,
    dueDate: addDays(today, 6),
  }),
  createTask("8", mockPeople[3], "Update project dependencies to latest versions #backend #frontend", ["backend", "frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12),
    likes: 2,
    replies: 1,
    status: "in-progress",
  }),
  createTask("9", mockPeople[0], "Buy groceries for the week #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
    dueDate: today,
  }),
  createTask("10", mockPeople[4], "Prepare monthly expense report #docs #review", ["docs", "review"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    likes: 1,
    dueDate: addDays(today, 1),
    status: "done",
    completedBy: "david",
  }),
  createTask("11", mockPeople[2], "Clean up old branches in repository #backend", ["backend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    likes: 4,
    replies: 2,
  }),

  // Top-level comments (general discussions - kind 1 text notes)
  createComment("c1", mockPeople[1], "Has anyone looked into the new React 19 features? Wondering if we should plan an upgrade. #frontend", ["frontend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
    likes: 8,
    replies: 4,
    reposts: 1,
  }),
  createComment("c2", mockPeople[3], "Reminder: Please update your timesheets before end of day Friday! #review", ["review"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
    likes: 2,
  }),
  createComment("c3", mockPeople[0], "Great progress on the website redesign this week, team! 🎉 #design", ["design"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    likes: 15,
    replies: 3,
    reposts: 2,
  }),
  createComment("c4", mockPeople[4], "Anyone interested in a lunch run today? Meeting at the lobby at noon. #planning", ["planning"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    likes: 5,
    replies: 2,
  }),
  createComment("c5", mockPeople[2], "FYI: The staging server will be down for maintenance tonight from 10pm-12am. #backend", ["backend"], {
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    likes: 7,
    replies: 1,
  }),
];

// Legacy export for compatibility
export const mockPosts = mockTasks;
