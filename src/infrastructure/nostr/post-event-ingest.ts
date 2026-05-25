import type { NostrEventWithRelay } from "@/lib/nostr/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskKind } from "@/domain/content/task-kind";
import { isTaskStateEventKind, mapTaskStateEventToTaskStatus, extractTaskStateTargetId } from "@/infrastructure/nostr/task-state-events";
import { isPriorityPropertyEvent, parsePriorityTag, extractPriorityTargetTaskId } from "@/infrastructure/nostr/task-property-events";
import {
  isDeletionEvent,
  extractDeletionTargetIds,
  extractDeletionAddresses,
} from "@/infrastructure/nostr/deletion-events";
import {
  hasLinkedTaskRef,
  parseLinkedTaskDueFromCalendarEvent,
  parseStandaloneCalendarEvent,
} from "@/infrastructure/nostr/nip52-task-calendar-events";
import { nostrEventToTask } from "@/infrastructure/nostr/task-converter";
import {
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
} from "@/infrastructure/nostr/replaceable-events";
import { findSpamKeyword } from "@/lib/nostr/spam-filter";
import {
  applyDateUpdate,
  applyDeletion,
  applyPriorityUpdate,
  applyStateUpdate,
  getPostIdByReplaceableKey,
  ingestPost,
} from "@/features/feed-page/stores/posts-store";

// Boundary between Nostr events and the typed posts-store. Each branch
// validates the event, converts it to the right typed shape, and calls a
// store API. The posts-store itself never sees a NostrEventWithRelay.

const spamDropCountsByRelay = new Map<string, number>();
function logSpamDrop(event: NostrEventWithRelay, keyword: string): void {
  const relayKey = event.relayUrls[0] || "unknown";
  const prev = spamDropCountsByRelay.get(relayKey) ?? 0;
  spamDropCountsByRelay.set(relayKey, prev + 1);
  if (prev === 0) {
    console.debug(
      `[spam-filter] dropped kind-1 event ${event.id} from ${relayKey} (matched "${keyword}")`
    );
  } else if (prev + 1 === 10 || (prev + 1) % 100 === 0) {
    console.debug(`[spam-filter] ${prev + 1} kind-1 events dropped from ${relayKey}`);
  }
}

function hasHashtagSignal(event: Pick<NostrEventWithRelay, "tags" | "content">): boolean {
  return (
    event.tags.some((tag) => tag[0]?.toLowerCase() === "t" && Boolean(tag[1])) ||
    /#\w+/.test(event.content)
  );
}

function isCalendarKind(kind: number): boolean {
  return kind === NostrEventKind.CalendarDateBased || kind === NostrEventKind.CalendarTimeBased;
}

function isBaseTaskKind(kind: number): boolean {
  return (
    kind === NostrEventKind.Task ||
    kind === NostrEventKind.TextNote ||
    kind === NostrEventKind.ClassifiedListing
  );
}

function ingestBaseTask(event: NostrEventWithRelay): void {
  const replaceableKey = getReplaceableEventKey(event);
  const post = nostrEventToTask(event);
  ingestPost({ post, replaceableKey });
}

function ingestStandaloneCalendar(event: NostrEventWithRelay): void {
  const post = parseStandaloneCalendarEvent(event);
  if (!post) return;
  ingestPost({ post, replaceableKey: getReplaceableEventKey(event) });
}

function ingestStateEvent(event: NostrEventWithRelay): void {
  const targetId = extractTaskStateTargetId(event.tags);
  if (!targetId) return;
  applyStateUpdate({
    targetId,
    updateId: event.id,
    newState: mapTaskStateEventToTaskStatus(event.kind, event.content),
    authorPubkey: event.pubkey,
    timestampMs: event.created_at * 1000,
  });
}

function ingestCalendarDateFold(event: NostrEventWithRelay): void {
  const parsed = parseLinkedTaskDueFromCalendarEvent(event.kind, event.tags);
  if (!parsed.taskId || !parsed.dueDate) return;
  applyDateUpdate({
    targetId: parsed.taskId,
    authorPubkey: event.pubkey,
    type: parsed.dateType ?? "due",
    date: parsed.dueDate,
    time: parsed.dueTime,
    timestampMs: event.created_at * 1000,
  });
}

function ingestPriorityFold(event: NostrEventWithRelay): void {
  const targetId = extractPriorityTargetTaskId(event.tags);
  const priority = parsePriorityTag(event.tags);
  if (!targetId || typeof priority !== "number") return;
  applyPriorityUpdate({
    targetId,
    authorPubkey: event.pubkey,
    priority,
    timestampMs: event.created_at * 1000,
  });
}

function ingestDeletion(event: NostrEventWithRelay): void {
  const targetIds = new Set(extractDeletionTargetIds(event.tags));
  for (const address of extractDeletionAddresses(event.tags)) {
    // Address-based deletions (NIP-09 + NIP-01) target parameterized-replaceable
    // events that the store keys by id. Translate the live address → current
    // post id so applyDeletion's id-based path can do its pubkey check.
    const postId = getPostIdByReplaceableKey(address);
    if (postId) targetIds.add(postId);
  }
  if (targetIds.size === 0) return;
  applyDeletion({ targetIds: Array.from(targetIds), byPubkey: event.pubkey });
}

/**
 * Dispatches a post-relevant Nostr event into the typed posts-store. Returns
 * false when the event is rejected (wrong kind, missing relay attribution,
 * spam, no hashtag signal, invalid parameterized-replaceable).
 *
 * Reactions (kind 7), Metadata (kind 0), and UserStatus (kind 30315) are
 * dispatched elsewhere and never reach this function.
 */
export function ingestPostEvent(event: NostrEventWithRelay): boolean {
  if (!event.id) return false;
  if (event.relayUrls.length === 0) {
    console.warn("[post-event-ingest] dropping event without relay attribution", {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
    });
    return false;
  }
  if (isParameterizedReplaceableKind(event.kind) && getReplaceableEventKey(event) === null) {
    return false;
  }

  if (isDeletionEvent(event.kind)) {
    ingestDeletion(event);
    return true;
  }

  if (isTaskStateEventKind(event.kind)) {
    ingestStateEvent(event);
    if (isPriorityPropertyEvent(event.kind, event.tags)) {
      ingestPriorityFold(event);
    }
    return true;
  }

  if (isCalendarKind(event.kind)) {
    if (hasLinkedTaskRef(event.tags)) {
      ingestCalendarDateFold(event);
    } else {
      ingestStandaloneCalendar(event);
    }
    return true;
  }

  if (event.kind === NostrEventKind.TextNote && isPriorityPropertyEvent(event.kind, event.tags)) {
    ingestPriorityFold(event);
    return true;
  }

  if (isBaseTaskKind(event.kind)) {
    // TextNote / Task require a hashtag signal to count as a post.
    if ((event.kind === NostrEventKind.TextNote || isTaskKind(event.kind)) && !hasHashtagSignal(event)) {
      return false;
    }
    if (event.kind === NostrEventKind.TextNote) {
      const spamKeyword = findSpamKeyword(event.content);
      if (spamKeyword) {
        logSpamDrop(event, spamKeyword);
        return false;
      }
    }
    ingestBaseTask(event);
    return true;
  }

  return false;
}
