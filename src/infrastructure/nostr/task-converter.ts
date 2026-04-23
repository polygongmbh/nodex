import { type FeedMessageType, type TaskStateUpdate, type TaskStatusType, Task, getLastEditedAt } from "@/types";
import type { Person } from "@/types/person";
import { extractMentionIdentifiersFromContent } from "@/lib/mentions";
import {
  extractTaskStateTargetId,
  isTaskStateEventKind,
  mapTaskStateEventToTaskStatus,
} from "@/infrastructure/nostr/task-state-events";
import {
  extractPriorityTargetTaskId,
  isPriorityPropertyEvent,
  parsePriorityTag,
} from "@/infrastructure/nostr/task-property-events";
import { parseLinkedTaskDueFromCalendarEvent } from "@/infrastructure/nostr/nip52-task-calendar-events";
import { parseNip99MetadataFromTags } from "@/infrastructure/nostr/nip99-metadata";
import { parseFirstGeohashTag } from "@/infrastructure/nostr/geohash-location";
import {
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
} from "@/infrastructure/nostr/replaceable-events";
import {
  extractEmbeddableAttachmentsFromContent,
  extractSha256FromUrl,
  normalizePublishedAttachments,
  parseImetaTag,
  parseNip94AttachmentMetadataTags,
} from "@/lib/attachments";
import { extractHashtagsFromContent } from "@/lib/hashtags";
import { extractNostrContentReferences } from "@/lib/nostr/content-references";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { canPubkeyUpdateTask } from "@/domain/content/task-permissions";
import { NostrEvent, NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";
import { getRelayIdFromUrl } from "./relay-identity";

const SPAM_KEYWORDS = [
  "onlyfans",
  "xxx",
  "porn",
  "nude",
  "nudes",
  "nsfw",
  "sex",
  "sexy",
  "horny",
  "adult content",
  "18+",
  "🔞",
  "cum",
  "dick",
  "pussy",
  "cock",
  "boobs",
  "tits",
  "milf",
  "fuck",
  "fucking",
  "blowjob",
  "handjob",
  "escort",
  "hookup",
  "airdrop",
  "giveaway",
  "free money",
  "click here",
  "act now",
  "limited time",
  "dm me",
  "dm for",
  "follow back",
  "f4f",
  "follow me",
  "check my",
  "visit my",
  "get rich",
  "make money",
  "earn money",
  "crypto giveaway",
  "free btc",
  "free bitcoin",
  "telegram",
  "whatsapp",
  "signal group",
  "join my",
  "subscribe to",
  "casino",
  "betting",
  "gambling",
  "lottery",
  "jackpot",
];

export function isSpamContent(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return SPAM_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
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

function getDisplayNameFromPubkey(pubkey: string): string {
  return formatUserFacingPubkey(pubkey);
}

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

  return "offer";
}

export function nostrEventToTask(event: NostrEventWithRelay): Task {
  const authorFallbackLabel = formatUserFacingPubkey(event.pubkey);
  const author: Person = {
    id: event.pubkey,
    name: authorFallbackLabel,
    displayName: getDisplayNameFromPubkey(event.pubkey),
    isOnline: true,
    isSelected: false,
  };

  const normalizedContent = replaceIndexedPersonMentions(event.content, event.tags);
  const contentTags = extractHashtagsFromContent(normalizedContent);
  const eventTags = event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "t")
    .map((tag) => tag[1].toLowerCase());
  const allTags = [...new Set([...eventTags, ...contentTags])];
  const isTask = event.kind === NostrEventKind.Task;
  const feedMessageType = getFeedMessageType(event);
  const nip99 = feedMessageType ? parseNip99MetadataFromTags(event.tags) : undefined;
  const locationGeohash = parseFirstGeohashTag(event.tags);

  let status: TaskStatusType = "open";
  const statusTag = event.tags.find((tag) => tag[0] === "status");
  if (statusTag) {
    const statusValue = statusTag[1].toLowerCase();
    if (statusValue === "done" || statusValue === "completed") {
      status = "done";
    } else if (statusValue === "closed") {
      status = "closed";
    } else if (statusValue === "in-progress" || statusValue === "active") {
      status = "active";
    }
  }

  const parentTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "parent");
  const replyTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "reply");
  const parentId = parentTag?.[1] || replyTag?.[1];
  const dueTag = event.tags.find((tag) => tag[0] === "due" && tag[1]);
  const dueTimeTag = event.tags.find((tag) => tag[0] === "due_time" && tag[1]);
  const dateTypeTag = event.tags.find((tag) => tag[0] === "date_type" && tag[1]);
  const mentionedPubkeys = event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "p" && tag[1])
    .map((tag) => tag[1].toLowerCase());
  const mentionedHandles = extractMentionIdentifiersFromContent(normalizedContent);
  const referencedProfilePubkeys = extractNostrContentReferences(normalizedContent)
    .flatMap((reference) => (reference.type === "profile" ? [reference.pubkey] : []));
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
  const contentAttachments = extractEmbeddableAttachmentsFromContent(normalizedContent).map(
    (attachment) => {
      const byUrl = nip94ByUrl.get(attachment.url.toLowerCase());
      const hashFromUrl = extractSha256FromUrl(attachment.url);
      const bySha = hashFromUrl ? nip94BySha.get(hashFromUrl) : undefined;
      return {
        ...attachment,
        ...bySha,
        ...byUrl,
        url: attachment.url,
      };
    }
  );
  const attachments = normalizePublishedAttachments([
    ...imetaAttachments,
    ...nip94LikeAttachments.filter(
      (attachment): attachment is typeof attachment & { url: string } => Boolean(attachment.url)
    ),
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
    if (
      normalized === "scheduled" ||
      normalized === "start" ||
      normalized === "end" ||
      normalized === "milestone" ||
      normalized === "due"
    ) {
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
    likes: 0,
    replies: 0,
    reposts: 0,
    status,
    parentId,
    dueDate,
    dueTime: dueTimeTag?.[1],
    dateType,
    mentions: Array.from(new Set([...mentionedPubkeys, ...mentionedHandles, ...referencedProfilePubkeys])),
    assigneePubkeys: isTask ? Array.from(new Set(mentionedPubkeys)) : undefined,
    priority,
    attachments: attachments.length > 0 ? attachments : undefined,
    rawNostrEvent: {
      id: event.id,
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      content: event.content,
      sig: event.sig,
    },
  };
}

export function eventHasTags(event: NostrEvent): boolean {
  const hasTTags = event.tags.some((tag) => tag[0]?.toLowerCase() === "t" && tag[1]);
  if (hasTTags) return true;
  return extractHashtagsFromContent(event.content).length > 0;
}

export function extractAllTags(events: NostrEvent[]): string[] {
  const allTags = new Set<string>();

  events.forEach((event) => {
    event.tags
      .filter((tag) => tag[0]?.toLowerCase() === "t" && tag[1])
      .forEach((tag) => allTags.add(tag[1].toLowerCase()));

    const contentTags = extractHashtagsFromContent(event.content);
    contentTags.forEach((tag) => allTags.add(tag));
  });

  return Array.from(allTags).sort();
}

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
    { createdAt: number; status: TaskStatusType; statusDescription?: string }
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
        status: mapped.type,
        statusDescription: mapped.description,
      });
    }

    const existingUpdates = stateUpdatesByTaskId.get(targetTaskId) || [];
    existingUpdates.push({
      id: stateEvent.id,
      status: mapped,
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
      dueTime: due.dueTime,
      dateType: due.dateType,
      ...(due.createdAt * 1000 > getLastEditedAt(task).getTime() && {
        lastEditedAt: new Date(due.createdAt * 1000),
      }),
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
      ...(update.createdAt * 1000 > getLastEditedAt(task).getTime() && {
        lastEditedAt: new Date(update.createdAt * 1000),
      }),
    });
  }

  return Array.from(taskMap.values());
}
