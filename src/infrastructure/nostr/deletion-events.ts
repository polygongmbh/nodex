import { NostrEventKind, type NostrEvent } from "@/lib/nostr/types";
import { isParameterizedReplaceableKind } from "@/infrastructure/nostr/replaceable-events";

export const DELETION_EVENT_KIND = NostrEventKind.EventDeletion;

export function isDeletionEvent(kind: number): boolean {
  return kind === DELETION_EVENT_KIND;
}

export interface DeletionTarget {
  id: string;
  kind: number;
  /** Author pubkey of the original event. Required to emit an `a` tag. */
  pubkey?: string;
  /** NIP-01 `d` identifier of the original event, for parameterized-replaceable kinds. */
  dTag?: string;
}

/**
 * Build the tags for a NIP-09 deletion event.
 *
 * Always includes `e` (event id) and `k` (kind). For parameterized-replaceable
 * kinds (30000–39999) — calendar events, classified listings, etc. — also
 * includes an `a` tag (`<kind>:<pubkey>:<d>`), which is the canonical
 * NIP-01 address. Relays that index these kinds by address need the `a`
 * tag to apply the deletion against the address-keyed copy.
 */
export function buildDeletionTags(target: DeletionTarget | Pick<NostrEvent, "id" | "kind">): string[][] {
  const tags: string[][] = [
    ["e", target.id],
    ["k", String(target.kind)],
  ];
  const pubkey = (target as DeletionTarget).pubkey?.trim().toLowerCase();
  const dTag = (target as DeletionTarget).dTag?.trim();
  if (isParameterizedReplaceableKind(target.kind) && pubkey && dTag) {
    tags.push(["a", `${target.kind}:${pubkey}:${dTag}`]);
  }
  return tags;
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

/**
 * Extract `a`-tag addresses (`<kind>:<pubkey>:<d>`) this deletion event
 * targets. Used for parameterized-replaceable kinds where the deletion
 * references the address rather than a single event id.
 */
export function extractDeletionAddresses(tags: string[][]): string[] {
  const addresses: string[] = [];
  for (const tag of tags) {
    if (tag[0]?.toLowerCase() === "a" && tag[1]) {
      addresses.push(tag[1]);
    }
  }
  return addresses;
}
