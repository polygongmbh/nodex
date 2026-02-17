import { NostrEvent, NostrEventKind } from "@/lib/nostr/types";
import { Task, Person } from "@/types";
import { extractTaskStateTargetId, isTaskStateEventKind, mapTaskStateEventToTaskStatus } from "@/lib/nostr/task-state-events";
import { parseLinkedTaskDueFromCalendarEvent } from "./task-calendar-events";
import { extractAssignedMentionsFromContent } from "@/lib/task-permissions";

// Spam keywords for basic filtering
const SPAM_KEYWORDS = [
  // Sexual content
  "onlyfans", "xxx", "porn", "nude", "nudes", "nsfw", "sex", "sexy", "horny",
  "adult content", "18+", "🔞", "cum", "dick", "pussy", "cock", "boobs", "tits",
  "milf", "fuck", "fucking", "blowjob", "handjob", "escort", "hookup",
  // Spam patterns
  "airdrop", "giveaway", "free money", "click here", "act now", "limited time",
  "dm me", "dm for", "follow back", "f4f", "follow me", "check my", "visit my",
  "get rich", "make money", "earn money", "crypto giveaway", "free btc", "free bitcoin",
  "telegram", "whatsapp", "signal group", "join my", "subscribe to",
  "casino", "betting", "gambling", "lottery", "jackpot",
];

// Check if content is spam
export function isSpamContent(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return SPAM_KEYWORDS.some(keyword => lowerContent.includes(keyword));
}

// Generate relay ID from URL - must match the ID generation in Index.tsx
export function getRelayIdFromUrl(url: string): string {
  return url.replace(/\/+$/, "").replace("wss://", "").replace("ws://", "").replace(/[./]/g, "-");
}

// Generate relay display name from URL - trim common prefixes
export function getRelayNameFromUrl(url: string): string {
  const stripped = url.replace("wss://", "").replace("ws://", "");
  // Remove common prefixes like relay., nostr., etc.
  return stripped
    .replace(/^relay\./, "")
    .replace(/^nostr\./, "")
    .replace(/^nos\./, "")
    .split(".")[0];
}

// Generate a display name from pubkey
function getDisplayNameFromPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}

// Extract hashtags from content
function extractHashtags(content: string): string[] {
  const hashtagRegex = /#(\w+)/g;
  const matches = content.match(hashtagRegex);
  if (!matches) return [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}
// Import the relay event type
import type { NostrEventWithRelay } from "./relay-pool";

// Convert Nostr event to Task
export function nostrEventToTask(event: NostrEventWithRelay): Task {
  const author: Person = {
    id: event.pubkey,
    name: event.pubkey.slice(0, 8),
    displayName: getDisplayNameFromPubkey(event.pubkey),
    isOnline: true,
    isSelected: false,
  };

  // Extract hashtags from content
  const contentTags = extractHashtags(event.content);

  // Extract tags from event tags (t tags) - these are the main nostr tags
  const eventTags = event.tags
    .filter((tag) => tag[0] === "t")
    .map((tag) => tag[1].toLowerCase());

  // Combine and dedupe tags - prioritize event tags (t tags)
  const allTags = [...new Set([...eventTags, ...contentTags])];

  // Determine task type from kind
  const isTask = event.kind === NostrEventKind.Task;

  // Extract status from tags for kind 1621
  let status: "todo" | "in-progress" | "done" = "todo";
  const statusTag = event.tags.find((tag) => tag[0] === "status");
  if (statusTag) {
    const statusValue = statusTag[1].toLowerCase();
    if (statusValue === "done" || statusValue === "completed") {
      status = "done";
    } else if (statusValue === "in-progress" || statusValue === "active") {
      status = "in-progress";
    }
  }

  // Extract parent ID from explicit parent marker first, then fallback to reply marker.
  const parentTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "parent");
  const replyTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "reply");
  const parentId = parentTag?.[1] || replyTag?.[1];
  const dueTag = event.tags.find((tag) => tag[0] === "due" && tag[1]);
  const dueTimeTag = event.tags.find((tag) => tag[0] === "due_time" && tag[1]);
  const mentionedPubkeys = event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "p" && tag[1])
    .map((tag) => tag[1].toLowerCase());
  const mentionedHandles = extractAssignedMentionsFromContent(event.content);

  let dueDate: Date | undefined;
  if (dueTag?.[1]) {
    if (/^\d+$/.test(dueTag[1])) {
      const parsed = new Date(Number(dueTag[1]) * 1000);
      if (!Number.isNaN(parsed.getTime())) {
        dueDate = parsed;
      }
    } else {
      const parsed = new Date(dueTag[1]);
      if (!Number.isNaN(parsed.getTime())) {
        dueDate = parsed;
      }
    }
  }

  // Generate relay ID from URL - use the attached relayUrl
  const relayId = event.relayUrl ? getRelayIdFromUrl(event.relayUrl) : "nostr";

  return {
    id: event.id,
    author,
    content: event.content,
    tags: allTags,
    relays: [relayId],
    taskType: isTask ? "task" : "comment",
    timestamp: new Date(event.created_at * 1000),
    lastEditedAt: new Date(event.created_at * 1000),
    likes: 0,
    replies: 0,
    reposts: 0,
    status: isTask ? status : undefined,
    parentId,
    dueDate,
    dueTime: dueTimeTag?.[1] || undefined,
    mentions: Array.from(new Set([...mentionedPubkeys, ...mentionedHandles])),
  };
}

// Check if an event has any tags (t tags or hashtags in content)
export function eventHasTags(event: NostrEvent): boolean {
  // Check for t tags
  const hasTTags = event.tags.some((tag) => tag[0] === "t" && tag[1]);
  if (hasTTags) return true;
  
  // Check for hashtags in content
  const hashtagRegex = /#(\w+)/g;
  return hashtagRegex.test(event.content);
}

// Extract all unique tags from multiple events
export function extractAllTags(events: NostrEvent[]): string[] {
  const allTags = new Set<string>();
  
  events.forEach((event) => {
    // Extract t tags
    event.tags
      .filter((tag) => tag[0] === "t" && tag[1])
      .forEach((tag) => allTags.add(tag[1].toLowerCase()));
    
    // Extract hashtags from content
    const contentTags = extractHashtags(event.content);
    contentTags.forEach((tag) => allTags.add(tag));
  });
  
  return Array.from(allTags).sort();
}

// Convert multiple Nostr events to Tasks
export function nostrEventsToTasks(events: NostrEventWithRelay[]): Task[] {
  const taskEvents = events.filter((event) =>
    event.kind === NostrEventKind.Task || event.kind === NostrEventKind.TextNote
  );
  const stateEvents = events.filter((event) => isTaskStateEventKind(event.kind));
  const calendarEvents = events.filter(
    (event) =>
      event.kind === NostrEventKind.CalendarDateBased ||
      event.kind === NostrEventKind.CalendarTimeBased
  );

  const taskMap = new Map<string, Task>(
    taskEvents.map((event) => {
      const task = nostrEventToTask(event);
      return [task.id, task];
    })
  );

  const latestStateByTaskId = new Map<
    string,
    { createdAt: number; status: Task["status"]; statusDescription?: string }
  >();

  for (const stateEvent of stateEvents) {
    const targetTaskId = extractTaskStateTargetId(stateEvent.tags);
    if (!targetTaskId) continue;
    if (!taskMap.has(targetTaskId)) continue;

    const mapped = mapTaskStateEventToTaskStatus(stateEvent.kind, stateEvent.content);
    const prev = latestStateByTaskId.get(targetTaskId);
    if (!prev || stateEvent.created_at >= prev.createdAt) {
      latestStateByTaskId.set(targetTaskId, {
        createdAt: stateEvent.created_at,
        status: mapped.status,
        statusDescription: mapped.statusDescription,
      });
    }
  }

  for (const [taskId, state] of latestStateByTaskId.entries()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    taskMap.set(taskId, {
      ...task,
      status: state.status,
      statusDescription: state.statusDescription,
      lastEditedAt: new Date(state.createdAt * 1000),
    });
  }

  const latestDueByTaskId = new Map<
    string,
    { createdAt: number; dueDate?: Date; dueTime?: string }
  >();

  for (const calendarEvent of calendarEvents) {
    const parsed = parseLinkedTaskDueFromCalendarEvent(calendarEvent.kind, calendarEvent.tags);
    if (!parsed.taskId || !taskMap.has(parsed.taskId) || !parsed.dueDate) continue;
    const prev = latestDueByTaskId.get(parsed.taskId);
    if (!prev || calendarEvent.created_at >= prev.createdAt) {
      latestDueByTaskId.set(parsed.taskId, {
        createdAt: calendarEvent.created_at,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
      });
    }
  }

  for (const [taskId, due] of latestDueByTaskId.entries()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    taskMap.set(taskId, {
      ...task,
      dueDate: due.dueDate,
      dueTime: due.dueTime ?? task.dueTime,
      lastEditedAt:
        !task.lastEditedAt || due.createdAt * 1000 > task.lastEditedAt.getTime()
          ? new Date(due.createdAt * 1000)
          : task.lastEditedAt,
    });
  }

  return Array.from(taskMap.values());
}

// Merge new tasks with existing tasks, avoiding duplicates
export function mergeTasks(existingTasks: Task[], newTasks: Task[]): Task[] {
  const existingIds = new Set(existingTasks.map((t) => t.id));
  const uniqueNewTasks = newTasks.filter((t) => !existingIds.has(t.id));
  return [...existingTasks, ...uniqueNewTasks].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}
