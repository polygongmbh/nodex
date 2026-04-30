import type { FeedMessageType, Nip99Metadata } from "@/types";

interface ListingLike {
  feedMessageType?: FeedMessageType;
  id: string;
  author?: {
    pubkey?: string;
  };
  nip99?: Nip99Metadata;
}

export function getListingReplaceableKey(task: ListingLike, listingEventKind: number): string | null {
  if (!task.feedMessageType) return null;
  const identifier = task.nip99?.identifier?.trim() || task.id?.trim();
  const authorPubkey = task.author?.pubkey?.trim().toLowerCase();
  if (!identifier || !authorPubkey) return null;
  return `${listingEventKind}:${authorPubkey}:${identifier}`;
}
