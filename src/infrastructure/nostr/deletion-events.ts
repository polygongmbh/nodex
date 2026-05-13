import { NostrEventKind, type NostrEvent } from "@/lib/nostr/types";

export const DELETION_EVENT_KIND = NostrEventKind.EventDeletion;

export function isDeletionEvent(kind: number): boolean {
  return kind === DELETION_EVENT_KIND;
}

/**
 * Build the tags for a NIP-09 deletion event.
 *
 * Includes the `e` tag pointing at the deleted event id, plus a `k` tag
 * carrying the original event kind so relays can route the deletion to the
 * right index.
 */
export function buildDeletionTags(target: Pick<NostrEvent, "id" | "kind">): string[][] {
  return [
    ["e", target.id],
    ["k", String(target.kind)],
  ];
}

/**
 * Extract every event id this deletion event targets. Multiple targets are
 * permitted by NIP-09.
 */
export function extractDeletionTargetIds(tags: string[][]): string[] {
  const ids: string[] = [];
  for (const tag of tags) {
    if (tag[0]?.toLowerCase() === "e" && tag[1]) {
      ids.push(tag[1]);
    }
  }
  return ids;
}
