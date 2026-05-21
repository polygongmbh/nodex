/**
 * Side store for `RawNostrEvent` payloads keyed by post id.
 *
 * The converter populates this as it builds Post objects; consumers that
 * need the original wire-level event (raw inspector modal, etc.) look it up
 * via `getRawEvent(postId)` rather than carrying it on every Post in memory.
 */

import type { RawNostrEvent } from "@/types";
import { registerMemdiagStore } from "@/lib/memdiag";

const rawEventsByPostId = new Map<string, RawNostrEvent>();

if (import.meta.env.DEV) {
  registerMemdiagStore("raw-events", () => {
    let tagsArrayCount = 0;
    let tagsCellCount = 0;
    for (const event of rawEventsByPostId.values()) {
      const tags = event.tags;
      if (Array.isArray(tags)) {
        tagsArrayCount += tags.length;
        for (const tag of tags) {
          if (Array.isArray(tag)) tagsCellCount += tag.length;
        }
      }
    }
    return {
      size: rawEventsByPostId.size,
      extras: { tagsArrayCount, tagsCellCount },
    };
  });
}

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
