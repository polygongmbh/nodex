import { NostrEventKind } from "@/lib/nostr/types";

export function isTaskKind(kind: NostrEventKind): boolean {
  return kind === NostrEventKind.Task;
}

export function isCommentKind(kind: NostrEventKind): boolean {
  return kind === NostrEventKind.TextNote;
}

export function isListingKind(kind: NostrEventKind): boolean {
  return kind === NostrEventKind.ClassifiedListing;
}
