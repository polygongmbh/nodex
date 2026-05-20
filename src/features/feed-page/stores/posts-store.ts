import { useSyncExternalStore } from "react";
import type { Post } from "@/types";
import type { NostrEventWithRelay } from "@/lib/nostr/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { nostrEventsToTasks } from "@/infrastructure/nostr/task-converter";
import { isTaskStateEventKind } from "@/infrastructure/nostr/task-state-events";
import { isPriorityPropertyEvent } from "@/infrastructure/nostr/task-property-events";
import { isDeletionEvent } from "@/infrastructure/nostr/deletion-events";
import { findSpamKeyword } from "@/lib/nostr/spam-filter";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import {
  getReplaceableEventKey,
  isParameterizedReplaceableKind,
} from "@/infrastructure/nostr/replaceable-events";
import { preserveTaskListIdentity } from "@/domain/content/task-identity";

// Owns the live timeline projection. Raw post-relevant events live INSIDE the
// store; consumers only see Post[]. Routed events (kind 0, kind 7, kind
// 30315) flow into their own concern stores and never reach here.

interface IngestablePostEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
  relayUrl?: string;
  relayUrls?: string[];
}

const POST_EVENT_KINDS: ReadonlySet<number> = new Set([
  NostrEventKind.Task,
  NostrEventKind.TextNote,
  NostrEventKind.ClassifiedListing,
  NostrEventKind.ClassifiedListingDraft,
  NostrEventKind.CalendarDateBased,
  NostrEventKind.CalendarTimeBased,
  NostrEventKind.Procedure,
]);

function isPostRelevantKind(event: Pick<IngestablePostEvent, "kind" | "tags">): boolean {
  if (POST_EVENT_KINDS.has(event.kind)) return true;
  if (isTaskStateEventKind(event.kind)) return true;
  if (isDeletionEvent(event.kind)) return true;
  if (isPriorityPropertyEvent(event.kind, event.tags)) return true;
  return false;
}

const eventsById = new Map<string, NostrEventWithRelay>();
const replaceableKeyToId = new Map<string, string>();
const subscribers = new Set<() => void>();
let version = 0;
let cachedPosts: Post[] = [];
let cachedPostsAtVersion = -1;
let suppressedEventIds: ReadonlySet<string> = new Set();

const spamDropCountsByRelay = new Map<string, number>();
function logSpamDrop(event: IngestablePostEvent, keyword: string): void {
  const relayKey = event.relayUrl || event.relayUrls?.[0] || "unknown";
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

function notifyChange(): void {
  version += 1;
  for (const subscriber of subscribers) subscriber();
}

function getRelayUrls(event: { relayUrl?: string; relayUrls?: string[] }): string[] {
  return normalizeRelayUrlScope([
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]);
}

export function ingestPostEvent(event: IngestablePostEvent): boolean {
  if (!event.id) return false;
  if (!isPostRelevantKind(event)) return false;
  if (isParameterizedReplaceableKind(event.kind) && getReplaceableEventKey(event) === null) {
    return false;
  }
  if (event.kind === NostrEventKind.TextNote && !isPriorityPropertyEvent(event.kind, event.tags)) {
    const spamKeyword = findSpamKeyword(event.content);
    if (spamKeyword) {
      logSpamDrop(event, spamKeyword);
      return false;
    }
  }

  const existing = eventsById.get(event.id);
  const incomingRelays = getRelayUrls(event);
  const mergedRelays = existing
    ? Array.from(new Set([...getRelayUrls(existing), ...incomingRelays])).sort()
    : incomingRelays;

  if (mergedRelays.length === 0) {
    console.warn("[posts-store] dropping event without relay attribution", {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
    });
    return false;
  }

  const normalized: NostrEventWithRelay = {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig || "",
    relayUrl: mergedRelays[0],
    relayUrls: mergedRelays,
  };

  const replaceableKey = getReplaceableEventKey(normalized);
  if (replaceableKey) {
    const replacedId = replaceableKeyToId.get(replaceableKey);
    if (replacedId && replacedId !== normalized.id) {
      eventsById.delete(replacedId);
    }
    replaceableKeyToId.set(replaceableKey, normalized.id);
  }

  eventsById.set(normalized.id, normalized);
  notifyChange();
  return true;
}

export function setPostsSuppression(ids: ReadonlySet<string>): void {
  if (ids === suppressedEventIds) return;
  if (ids.size === suppressedEventIds.size && [...ids].every((id) => suppressedEventIds.has(id))) return;
  suppressedEventIds = ids;
  notifyChange();
}

function projectPosts(): Post[] {
  if (cachedPostsAtVersion === version) return cachedPosts;
  const events: NostrEventWithRelay[] = [];
  for (const event of eventsById.values()) {
    if (suppressedEventIds.has(event.id)) continue;
    events.push(event);
  }
  const fresh = nostrEventsToTasks(events);
  cachedPosts = preserveTaskListIdentity(cachedPosts, fresh);
  cachedPostsAtVersion = version;
  return cachedPosts;
}

export function getPosts(): Post[] {
  return projectPosts();
}

export function getPostsVersion(): number {
  return version;
}

export function subscribeToPosts(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function usePosts(): Post[] {
  useSyncExternalStore(subscribeToPosts, getPostsVersion, getPostsVersion);
  return getPosts();
}

export function __resetPostsStoreForTests(): void {
  eventsById.clear();
  replaceableKeyToId.clear();
  cachedPosts = [];
  cachedPostsAtVersion = -1;
  version = 0;
  suppressedEventIds = new Set();
  spamDropCountsByRelay.clear();
}
