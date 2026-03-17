import type { NostrEventWithRelay } from "@/lib/nostr/types";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";

type ReplaceableLikeEvent = Pick<NostrEventWithRelay, "kind" | "pubkey" | "tags">;
type ReplaceableCachedEvent = Pick<CachedNostrEvent, "kind" | "pubkey" | "tags">;

const KIND_METADATA = 0;
const KIND_CONTACTS = 3;

export function isParameterizedReplaceableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

export function isUnparameterizedReplaceableKind(kind: number): boolean {
  return kind === KIND_METADATA || kind === KIND_CONTACTS || (kind >= 10000 && kind < 20000);
}

export function isReplaceableKind(kind: number): boolean {
  return isParameterizedReplaceableKind(kind) || isUnparameterizedReplaceableKind(kind);
}

function getDTag(tags: string[][]): string | undefined {
  const found = tags.find((tag) => tag[0]?.toLowerCase() === "d" && tag[1]);
  const normalized = found?.[1]?.trim();
  return normalized ? normalized : undefined;
}

export function getReplaceableEventKey(event: ReplaceableLikeEvent | ReplaceableCachedEvent): string | null {
  const kind = Number(event.kind);
  const pubkey = event.pubkey?.trim().toLowerCase();
  if (!Number.isFinite(kind) || !pubkey) return null;

  if (isParameterizedReplaceableKind(kind)) {
    const dTag = getDTag(event.tags);
    // Parameterized replaceable events require "d". Missing means invalid.
    if (!dTag) return null;
    return `${kind}:${pubkey}:${dTag}`;
  }

  if (isUnparameterizedReplaceableKind(kind)) {
    return `${kind}:${pubkey}`;
  }

  return null;
}

