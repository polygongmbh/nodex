import type { Nip99Metadata } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { isListingKind } from "@/domain/content/task-kind";

interface ListingLike {
  kind: NostrEventKind;
  id: string;
  author?: {
    pubkey?: string;
  };
  nip99?: Nip99Metadata;
}

export function getListingReplaceableKey(task: ListingLike, listingEventKind: number): string | null {
  if (!isListingKind(task.kind)) return null;
  const identifier = task.nip99?.identifier?.trim() || task.id?.trim();
  const authorPubkey = task.author?.pubkey?.trim().toLowerCase();
  if (!identifier || !authorPubkey) return null;
  return `${listingEventKind}:${authorPubkey}:${identifier}`;
}
