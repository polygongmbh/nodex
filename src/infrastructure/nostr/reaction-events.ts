import { NostrEventKind, type NostrEvent } from "@/lib/nostr/types";

export const REACTION_EVENT_KIND = NostrEventKind.Reaction;
export const DEFAULT_REACTION = "👍";

const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;

function isSingleEmojiGrapheme(text: string): boolean {
  if (!PICTOGRAPHIC_RE.test(text)) return false;
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const it = segmenter.segment(text)[Symbol.iterator]();
    const first = it.next();
    if (first.done) return false;
    return it.next().done === true;
  }
  return [...text].length <= 2;
}

export function isReactionEvent(kind: number): boolean {
  return kind === REACTION_EVENT_KIND;
}

export function buildReactionTags(target: Pick<NostrEvent, "id" | "kind" | "pubkey">): string[][] {
  return [
    ["e", target.id, "", target.pubkey],
    ["p", target.pubkey],
    ["k", String(target.kind)],
  ];
}

export function extractReactionTargetId(tags: string[][]): string | undefined {
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i];
    if (tag[0]?.toLowerCase() === "e" && tag[1]) return tag[1];
  }
  return undefined;
}

export function extractReactionTargetPubkey(tags: string[][]): string | undefined {
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i];
    if (tag[0]?.toLowerCase() === "p" && tag[1]) return tag[1];
  }
  return undefined;
}

/**
 * Normalize a reaction's `content` into a display emoji.
 * NIP-25: empty or "+" = like, "-" = dislike, otherwise a single emoji.
 * Shortcodes (`:heart:`) and arbitrary text are rejected — return undefined so callers can ignore.
 */
export function normalizeReactionContent(raw: string): string | undefined {
  const c = (raw ?? "").trim();
  if (c === "" || c === "+") return "👍";
  if (c === "-") return "👎";
  if (isSingleEmojiGrapheme(c)) return c;
  return undefined;
}
