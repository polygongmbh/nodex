import { NostrEventKind } from "@/lib/nostr/types";

export function isTaskKind(kind: NostrEventKind): kind is NostrEventKind.Task {
  return kind === NostrEventKind.Task;
}

export function isCommentKind(kind: NostrEventKind): kind is NostrEventKind.TextNote {
  return kind === NostrEventKind.TextNote;
}

export function isListingKind(kind: NostrEventKind): kind is NostrEventKind.ClassifiedListing {
  return kind === NostrEventKind.ClassifiedListing;
}
