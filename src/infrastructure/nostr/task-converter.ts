import { type TaskStateUpdate, type TaskState, type TaskStatus, type TaskReactions, type TaskDate, type TaskDateType, Task, getLastEditedAt } from "@/types";
import { isListingKind, isTaskKind } from "@/domain/content/task-kind";
import type { Person } from "@/types/person";
import { extractMentionIdentifiersFromContent } from "@/lib/mentions";
import {
  extractTaskStateTargetId,
  isTaskStateEventKind,
  mapTaskStateEventToTaskStatus,
} from "@/infrastructure/nostr/task-state-events";
import {
  extractReactionTargetId,
  isReactionEvent,
  normalizeReactionContent,
} from "@/infrastructure/nostr/reaction-events";
import {
  extractDeletionTargetIds,
  isDeletionEvent,
} from "@/infrastructure/nostr/deletion-events";
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

export function nostrEventToTask(event: NostrEventWithRelay): Task {
  const authorFallbackLabel = formatUserFacingPubkey(event.pubkey);
  const author: Person = {
    pubkey: event.pubkey,
    name: authorFallbackLabel,
    displayName: getDisplayNameFromPubkey(event.pubkey),
  };

  const normalizedContent = replaceIndexedPersonMentions(event.content, event.tags);
  const contentTags = extractHashtagsFromContent(normalizedContent);
  const eventTags = event.tags
    .filter((tag) => tag[0]?.toLowerCase() === "t")
    .map((tag) => tag[1].toLowerCase());
  const allTags = [...new Set([...eventTags, ...contentTags])];
  const isTask = isTaskKind(event.kind);
  const nip99 = isListingKind(event.kind) ? parseNip99MetadataFromTags(event.tags) : undefined;
  const locationGeohash = parseFirstGeohashTag(event.tags);

  const parentTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "parent");
  const replyTag = event.tags.find((tag) => tag[0] === "e" && tag[3] === "reply");
  const parentId = parentTag?.[1] || replyTag?.[1];
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

  return {
    id: event.id,
    kind: event.kind,
    author,
    content: normalizedContent,
    tags: allTags,
    relays: getRelayIdsFromEvent(event),
    ...(nip99 ? { nip99 } : {}),
    locationGeohash,
    timestamp: new Date(event.created_at * 1000),
    parentId,
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

type ReactionSummaryEvent = Pick<NostrEvent, "content" | "pubkey" | "tags"> & {
  kind: number;
};

export function summarizeReactionsByTarget(
  events: ReactionSummaryEvent[],
  viewerPubkey?: string,
): Map<string, TaskReactions> {
  // (targetId, pubkey) -> Set<emoji>. Dedup by (target, pubkey, emoji).
  const byTarget = new Map<string, Map<string, Set<string>>>();
  for (const event of events) {
    if (!isReactionEvent(event.kind)) continue;
    const targetId = extractReactionTargetId(event.tags);
    if (!targetId) continue;
    const emoji = normalizeReactionContent(event.content);
    if (!emoji) continue;
    const byPubkey = byTarget.get(targetId) ?? new Map<string, Set<string>>();
    const set = byPubkey.get(event.pubkey) ?? new Set<string>();
    set.add(emoji);
    byPubkey.set(event.pubkey, set);
    byTarget.set(targetId, byPubkey);
  }
  const result = new Map<string, TaskReactions>();
  for (const [targetId, byPubkey] of byTarget) {
    const totals: Record<string, number> = {};
    const mine: string[] = [];
    for (const [pubkey, emojis] of byPubkey) {
      for (const emoji of emojis) {
        totals[emoji] = (totals[emoji] ?? 0) + 1;
        if (viewerPubkey && pubkey === viewerPubkey) mine.push(emoji);
      }
    }
    result.set(targetId, { totals, mine });
  }
  return result;
}

export function nostrEventsToTasks(events: NostrEventWithRelay[]): Task[] {
  const isPriorityPropertyNote = (event: NostrEventWithRelay): boolean =>
    isPriorityPropertyEvent(event.kind, event.tags);

  const deletedTargetIdsByAuthor = new Map<string, Set<string>>();
  for (const event of events) {
    if (!isDeletionEvent(event.kind)) continue;
    const authorPubkey = event.pubkey;
    if (!authorPubkey) continue;
    const set = deletedTargetIdsByAuthor.get(authorPubkey) || new Set<string>();
    for (const targetId of extractDeletionTargetIds(event.tags)) {
      set.add(targetId);
    }
    deletedTargetIdsByAuthor.set(authorPubkey, set);
  }
  const isDeletedByOwnAuthor = (event: NostrEventWithRelay): boolean => {
    const deletedByAuthor = deletedTargetIdsByAuthor.get(event.pubkey);
    return Boolean(deletedByAuthor && deletedByAuthor.has(event.id));
  };

  const rawTaskEvents = events.filter(
    (event) =>
      (
        event.kind === NostrEventKind.Task ||
        event.kind === NostrEventKind.TextNote ||
        event.kind === NostrEventKind.ClassifiedListing
      ) &&
      !isPriorityPropertyNote(event) &&
      !isDeletedByOwnAuthor(event)
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
    { createdAt: number; status: TaskState }
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
        status: mapped,
      });
    }

    const existingUpdates = stateUpdatesByTaskId.get(targetTaskId) || [];
    existingUpdates.push({
      id: stateEvent.id,
      state: mapped,
      timestamp: new Date(stateEvent.created_at * 1000),
      authorPubkey: stateEvent.pubkey,
    });
    stateUpdatesByTaskId.set(targetTaskId, existingUpdates);
  }

  for (const [taskId, state] of latestStateByTaskId.entries()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    const stateUpdates = (stateUpdatesByTaskId.get(taskId) ?? []).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    taskMap.set(taskId, {
      ...task,
      stateUpdates,
      lastEditedAt: new Date(state.createdAt * 1000),
    });
  }

  const TASK_DATE_TYPE_ORDER: TaskDateType[] = ["due", "scheduled", "start", "end", "milestone"];
  const datesByTaskId = new Map<
    string,
    Map<TaskDateType, { createdAt: number; entry: TaskDate }>
  >();

  for (const calendarEvent of calendarEvents) {
    const parsed = parseLinkedTaskDueFromCalendarEvent(calendarEvent.kind, calendarEvent.tags);
    if (!parsed.taskId || !parsed.dueDate) continue;
    const task = taskMap.get(parsed.taskId);
    if (!task) continue;
    if (!canPubkeyUpdateTask(task, calendarEvent.pubkey)) continue;
    const type: TaskDateType = parsed.dateType ?? "due";
    const entry: TaskDate = {
      date: parsed.dueDate,
      time: parsed.dueTime,
      type,
    };
    let perType = datesByTaskId.get(parsed.taskId);
    if (!perType) {
      perType = new Map();
      datesByTaskId.set(parsed.taskId, perType);
    }
    const prev = perType.get(type);
    if (!prev || calendarEvent.created_at >= prev.createdAt) {
      perType.set(type, { createdAt: calendarEvent.created_at, entry });
    }
  }

  for (const [taskId, perType] of datesByTaskId.entries()) {
    const task = taskMap.get(taskId);
    if (!task) continue;
    const dates = TASK_DATE_TYPE_ORDER.flatMap((type) => {
      const slot = perType.get(type);
      return slot ? [slot.entry] : [];
    });
    const latestCreatedAt = Math.max(
      ...Array.from(perType.values()).map((slot) => slot.createdAt)
    );
    taskMap.set(taskId, {
      ...task,
      dates,
      ...(latestCreatedAt * 1000 > getLastEditedAt(task).getTime() && {
        lastEditedAt: new Date(latestCreatedAt * 1000),
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
