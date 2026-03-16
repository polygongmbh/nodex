import { NostrEvent, NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";
import { Task, Person, type FeedMessageType, type TaskStateUpdate } from "@/types";
import { extractTaskStateTargetId, isTaskStateEventKind, mapTaskStateEventToTaskStatus } from "@/lib/nostr/task-state-events";
import {
  extractPriorityTargetTaskId,
  isPriorityPropertyEvent,
  parsePriorityTag,
} from "@/lib/nostr/task-property-events";
import { parseLinkedTaskDueFromCalendarEvent } from "./nip52-task-calendar-events";
import { extractAssignedMentionsFromContent } from "@/lib/task-permissions";
import { relayUrlToId, relayUrlToName } from "@/lib/nostr/relay-url";
import { parseNip99MetadataFromTags } from "@/lib/nostr/nip99-metadata";
import { parseFirstGeohashTag } from "@/lib/nostr/geohash-location";
import { getReplaceableEventKey, isParameterizedReplaceableKind } from "@/lib/nostr/replaceable-events";
import {
  extractSha256FromUrl,
  extractEmbeddableAttachmentsFromContent,
  normalizePublishedAttachments,
  parseImetaTag,
  parseNip94AttachmentMetadataTags,
} from "@/lib/attachments";
import { canPubkeyUpdateTask } from "@/lib/task-permissions";

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
  return relayUrlToId(url);
}

// Generate relay display name from URL - trim common prefixes
export function getRelayNameFromUrl(url: string): string {
  return relayUrlToName(url);
}

function getRelayIdsFromEvent(event: NostrEventWithRelay): string[] {
  const relayUrls = [
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => Boolean(url));
  const relayIds = Array.from(new Set(relayUrls.map((url) => getRelayIdFromUrl(url))));
  if (relayIds.length === 0) return ["nostr"];
  return relayIds;
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

// Replace indexed Nostr person references (e.g. #[0]) with @<pubkey> mention tokens.
function replaceIndexedPersonMentions(content: string, tags: string[][]): string {
  return content.replace(/#\[(\d+)\]/g, (fullMatch, indexRaw: string) => {
    const index = Number.parseInt(indexRaw, 10);
    if (!Number.isInteger(index) || index < 0 || index >= tags.length) {
      return fullMatch;
    }
    const referencedTag = tags[index];
    if (!referencedTag || referencedTag[0]?.toLowerCase() !== "p" || !referencedTag[1]) {
      return fullMatch;
    }
    return `@${referencedTag[1].toLowerCase()}`;
  });
}

function getFeedMessageType(event: NostrEventWithRelay): FeedMessageType | undefined {
  if (event.kind !== NostrEventKind.ClassifiedListing) return undefined;

  const typeTagValue = event.tags
    .find((tag) => tag[0]?.toLowerCase() === "type" && tag[1])
    ?.[1]
    ?.trim()
    .toLowerCase();
  if (typeTagValue === "offer" || typeTagValue === "request") {
    return typeTagValue;
  }

  const tTagValues = new Set(
    event.tags
      .filter((tag) => tag[0]?.toLowerCase() === "t" && tag[1])
      .map((tag) => tag[1].trim().toLowerCase())
  );
  if (tTagValues.has("request")) return "request";

  // NIP-99 listings default to offers when no explicit request marker is provided.
  return "offer";
}

// Convert Nostr event to Task
export function nostrEventToTask(event: NostrEventWithRelay): Task {
  const author: Person = {
    id: event.pubkey,
    name: event.pubkey.slice(0, 8),
    displayName: getDisplayNameFromPubkey(event.pubkey),
    isOnline: true,
    isSelected: false,
  };

  const normalizedContent = replaceIndexedPersonMentions(event.content, event.tags);

  // Extract hashtags from content
  const contentTags = extractHashtags(normalizedContent);

  // Extract tags from event tags (t tags) - these are the main nostr tags
  const eventTags = event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "t")
    .map((tag) => tag[1].toLowerCase());

  // Combine and dedupe tags - prioritize event tags (t tags)
  const allTags = [...new Set([...eventTags, ...contentTags])];

  // Determine task type from kind
  const isTask = event.kind === NostrEventKind.Task;
  const feedMessageType = getFeedMessageType(event);
  const nip99 = feedMessageType ? parseNip99MetadataFromTags(event.tags) : undefined;
  const locationGeohash = parseFirstGeohashTag(event.tags);

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
  const dateTypeTag = event.tags.find((tag) => tag[0] === "date_type" && tag[1]);
  const mentionedPubkeys = event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "p" && tag[1])
    .map((tag) => tag[1].toLowerCase());
  const mentionedHandles = extractAssignedMentionsFromContent(normalizedContent);
  const priority = parsePriorityTag(event.tags);
  const imetaAttachments = event.tags
    .map((tag) => parseImetaTag(tag))
    .filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment));
  const nip94LikeAttachments = parseNip94AttachmentMetadataTags(event.tags);
  const nip94ByUrl = new Map(
    nip94LikeAttachments
      .filter((attachment): attachment is typeof attachment & { url: string } => Boolean(attachment.url))
      .map((attachment) => [attachment.url.toLowerCase(), attachment])
  );
  const nip94BySha = new Map(
    nip94LikeAttachments
      .filter((attachment): attachment is typeof attachment & { sha256: string } => Boolean(attachment.sha256))
      .map((attachment) => [attachment.sha256.toLowerCase(), attachment])
  );
  const contentAttachments = extractEmbeddableAttachmentsFromContent(normalizedContent).map((attachment) => {
    const byUrl = nip94ByUrl.get(attachment.url.toLowerCase());
    const hashFromUrl = extractSha256FromUrl(attachment.url);
    const bySha = hashFromUrl ? nip94BySha.get(hashFromUrl) : undefined;
    return {
      ...attachment,
      ...bySha,
      ...byUrl,
      url: attachment.url,
    };
  });
  const attachments = normalizePublishedAttachments([
    ...imetaAttachments,
    ...nip94LikeAttachments.filter((attachment): attachment is typeof attachment & { url: string } => Boolean(attachment.url)),
    ...contentAttachments,
  ]);

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
  const dateType = (() => {
    const normalized = (dateTypeTag?.[1] || "").toLowerCase();
    if (normalized === "scheduled" || normalized === "start" || normalized === "end" || normalized === "milestone" || normalized === "due") {
      return normalized;
    }
    return dueTag ? "due" : undefined;
  })();

  return {
    id: event.id,
    author,
    content: normalizedContent,
    tags: allTags,
    relays: getRelayIdsFromEvent(event),
    taskType: isTask ? "task" : "comment",
    feedMessageType,
    nip99,
    locationGeohash,
    timestamp: new Date(event.created_at * 1000),
    lastEditedAt: new Date(event.created_at * 1000),
    likes: 0,
    replies: 0,
    reposts: 0,
    status: isTask ? status : undefined,
    parentId,
    dueDate,
    dueTime: dueTimeTag?.[1] || undefined,
    dateType,
    mentions: Array.from(new Set([...mentionedPubkeys, ...mentionedHandles])),
    assigneePubkeys: isTask ? Array.from(new Set(mentionedPubkeys)) : undefined,
    priority,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

// Check if an event has any tags (t tags or hashtags in content)
export function eventHasTags(event: NostrEvent): boolean {
  // Check for t tags
  const hasTTags = event.tags.some((tag) => tag[0]?.toLowerCase() === "t" && tag[1]);
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
      .filter((tag) => tag[0]?.toLowerCase() === "t" && tag[1])
      .forEach((tag) => allTags.add(tag[1].toLowerCase()));
    
    // Extract hashtags from content
    const contentTags = extractHashtags(event.content);
    contentTags.forEach((tag) => allTags.add(tag));
  });
  
  return Array.from(allTags).sort();
}

// Convert multiple Nostr events to Tasks
export function nostrEventsToTasks(events: NostrEventWithRelay[]): Task[] {
  const isPriorityPropertyNote = (event: NostrEventWithRelay): boolean =>
    isPriorityPropertyEvent(event.kind, event.tags);

  const rawTaskEvents = events.filter(
    (event) =>
      (
        event.kind === NostrEventKind.Task ||
        event.kind === NostrEventKind.TextNote ||
        event.kind === NostrEventKind.ClassifiedListing
      ) &&
      !isPriorityPropertyNote(event)
  );
  const taskEventsById = new Map<string, NostrEventWithRelay>();
  const replaceableTaskEvents = new Map<string, NostrEventWithRelay>();
  for (const event of rawTaskEvents) {
    // Parameterized replaceable events missing "d" are invalid and ignored.
    if (isParameterizedReplaceableKind(event.kind) && getReplaceableEventKey(event) === null) {
      continue;
    }
    const replaceableKey = getReplaceableEventKey(event);
    if (!replaceableKey) {
      taskEventsById.set(event.id, event);
      continue;
    }
    const existing = replaceableTaskEvents.get(replaceableKey);
    if (
      !existing ||
      event.created_at > existing.created_at ||
      (event.created_at === existing.created_at && event.id > existing.id)
    ) {
      replaceableTaskEvents.set(replaceableKey, event);
    }
  }
  const taskEvents = [...taskEventsById.values(), ...replaceableTaskEvents.values()];
  const stateEvents = events.filter((event) => isTaskStateEventKind(event.kind));
  const priorityPropertyEvents = events.filter(isPriorityPropertyNote);
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
  const stateUpdatesByTaskId = new Map<string, TaskStateUpdate[]>();

  for (const stateEvent of stateEvents) {
    const targetTaskId = extractTaskStateTargetId(stateEvent.tags);
    if (!targetTaskId) continue;
    const task = taskMap.get(targetTaskId);
    if (!task) continue;
    if (!canPubkeyUpdateTask(task, stateEvent.pubkey)) continue;

    const mapped = mapTaskStateEventToTaskStatus(stateEvent.kind, stateEvent.content);
    const prev = latestStateByTaskId.get(targetTaskId);
    if (!prev || stateEvent.created_at >= prev.createdAt) {
      latestStateByTaskId.set(targetTaskId, {
        createdAt: stateEvent.created_at,
        status: mapped.status,
        statusDescription: mapped.statusDescription,
      });
    }

    const existingUpdates = stateUpdatesByTaskId.get(targetTaskId) || [];
    existingUpdates.push({
      id: stateEvent.id,
      status: mapped.status,
      statusDescription: mapped.statusDescription,
      timestamp: new Date(stateEvent.created_at * 1000),
      authorPubkey: stateEvent.pubkey,
    });
    stateUpdatesByTaskId.set(targetTaskId, existingUpdates);
  }

  for (const [taskId, state] of latestStateByTaskId.entries()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    const stateUpdates = (stateUpdatesByTaskId.get(taskId) || []).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    taskMap.set(taskId, {
      ...task,
      status: state.status,
      statusDescription: state.statusDescription,
      stateUpdates,
      lastEditedAt: new Date(state.createdAt * 1000),
    });
  }

  const latestDueByTaskId = new Map<
    string,
    { createdAt: number; dueDate?: Date; dueTime?: string; dateType?: Task["dateType"] }
  >();

  for (const calendarEvent of calendarEvents) {
    const parsed = parseLinkedTaskDueFromCalendarEvent(calendarEvent.kind, calendarEvent.tags);
    if (!parsed.taskId || !parsed.dueDate) continue;
    const task = taskMap.get(parsed.taskId);
    if (!task) continue;
    if (!canPubkeyUpdateTask(task, calendarEvent.pubkey)) continue;
    const prev = latestDueByTaskId.get(parsed.taskId);
    if (!prev || calendarEvent.created_at >= prev.createdAt) {
      latestDueByTaskId.set(parsed.taskId, {
        createdAt: calendarEvent.created_at,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        dateType: parsed.dateType,
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
      dateType: due.dateType ?? task.dateType,
      lastEditedAt:
        !task.lastEditedAt || due.createdAt * 1000 > task.lastEditedAt.getTime()
          ? new Date(due.createdAt * 1000)
          : task.lastEditedAt,
    });
  }

  const latestPriorityByTaskId = new Map<string, { createdAt: number; priority: number }>();
  for (const propertyEvent of priorityPropertyEvents) {
    const taskId = extractPriorityTargetTaskId(propertyEvent.tags);
    const priority = parsePriorityTag(propertyEvent.tags);
    if (!taskId || typeof priority !== "number") continue;
    const task = taskMap.get(taskId);
    if (!task) continue;
    if (!canPubkeyUpdateTask(task, propertyEvent.pubkey)) continue;
    const prev = latestPriorityByTaskId.get(taskId);
    if (!prev || propertyEvent.created_at >= prev.createdAt) {
      latestPriorityByTaskId.set(taskId, {
        createdAt: propertyEvent.created_at,
        priority,
      });
    }
  }

  for (const [taskId, update] of latestPriorityByTaskId.entries()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    taskMap.set(taskId, {
      ...task,
      priority: update.priority,
      lastEditedAt:
        !task.lastEditedAt || update.createdAt * 1000 > task.lastEditedAt.getTime()
          ? new Date(update.createdAt * 1000)
          : task.lastEditedAt,
    });
  }

  return Array.from(taskMap.values());
}

// Merge new tasks with existing tasks, avoiding duplicates
export function mergeTasks(existingTasks: Task[], newTasks: Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const task of existingTasks) {
    byId.set(task.id, task);
  }
  for (const incoming of newTasks) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    const mergedRelays = Array.from(new Set([...(existing.relays || []), ...(incoming.relays || [])]));
    byId.set(incoming.id, {
      ...(existing.timestamp.getTime() >= incoming.timestamp.getTime() ? existing : incoming),
      relays: mergedRelays,
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
