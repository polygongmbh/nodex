import { NostrEvent, NostrEventKind } from "@/lib/nostr/types";
import { Task, Person } from "@/types";

// Generate a deterministic avatar from pubkey
function getAvatarFromPubkey(pubkey: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey.slice(0, 8)}`;
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

// Convert Nostr event to Task
export function nostrEventToTask(event: NostrEvent, relayUrl?: string): Task {
  const author: Person = {
    id: event.pubkey,
    name: event.pubkey.slice(0, 8),
    displayName: getDisplayNameFromPubkey(event.pubkey),
    avatar: getAvatarFromPubkey(event.pubkey),
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

  // Extract parent ID from reply tags
  const replyTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "reply");
  const parentId = replyTag ? replyTag[1] : undefined;

  // Generate relay ID from URL - use a consistent format
  const relayId = relayUrl
    ? relayUrl.replace("wss://", "").replace("ws://", "").replace(/[./]/g, "-")
    : "nostr";

  return {
    id: event.id,
    author,
    content: event.content,
    tags: allTags,
    relays: [relayId],
    taskType: isTask ? "task" : "comment",
    timestamp: new Date(event.created_at * 1000),
    likes: 0,
    replies: 0,
    reposts: 0,
    status: isTask ? status : undefined,
    parentId,
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
export function nostrEventsToTasks(events: NostrEvent[], relayUrl?: string): Task[] {
  return events.map((event) => nostrEventToTask(event, relayUrl));
}

// Merge new tasks with existing tasks, avoiding duplicates
export function mergeTasks(existingTasks: Task[], newTasks: Task[]): Task[] {
  const existingIds = new Set(existingTasks.map((t) => t.id));
  const uniqueNewTasks = newTasks.filter((t) => !existingIds.has(t.id));
  return [...existingTasks, ...uniqueNewTasks].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}
