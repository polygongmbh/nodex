/**
 * Side store for `RawNostrEvent` payloads keyed by post id.
 *
 * The converter populates this as it builds Post objects; consumers that
 * need the original wire-level event (raw inspector modal, etc.) look it up
 * via `getRawEvent(postId)` rather than carrying it on every Post in memory.
 */

import type { RawNostrEvent } from "@/types";

const rawEventsByPostId = new Map<string, RawNostrEvent>();

export function setRawEvent(postId: string, event: RawNostrEvent): void {
  rawEventsByPostId.set(postId, event);
}

export function getRawEvent(postId: string): RawNostrEvent | undefined {
  return rawEventsByPostId.get(postId);
}

export function deleteRawEvent(postId: string): void {
  rawEventsByPostId.delete(postId);
}

export function clearRawEvents(): void {
  rawEventsByPostId.clear();
}

/** Test-only: snapshot of current contents. Do not use in production code. */
export function __getRawEventsSnapshotForTest(): Map<string, RawNostrEvent> {
  return new Map(rawEventsByPostId);
}
