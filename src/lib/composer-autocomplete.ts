import type { Channel } from "@/types";
import { MENTION_AT_CURSOR_REGEX } from "@/lib/content-tokens";
import { getHashtagQueryAtCursor } from "@/lib/hashtags";

export type ComposerAutocompleteMatch =
  | { kind: "hashtag"; query: string }
  | { kind: "mention"; query: string };

export function getComposerAutocompleteMatch(textBeforeCursor: string): ComposerAutocompleteMatch | null {
  const hashtagQuery = getHashtagQueryAtCursor(textBeforeCursor);
  if (hashtagQuery !== null) {
    return {
      kind: "hashtag",
      query: hashtagQuery,
    };
  }

  const mentionMatch = textBeforeCursor.match(MENTION_AT_CURSOR_REGEX);
  if (mentionMatch) {
    return {
      kind: "mention",
      query: (mentionMatch[2] || "").toLowerCase(),
    };
  }

  return null;
}

export function hasMentionQueryAtCursor(textBeforeCursor: string): boolean {
  return MENTION_AT_CURSOR_REGEX.test(textBeforeCursor);
}

export function filterChannelsForAutocomplete(channels: Channel[], hashtagFilter: string, maxResults?: number): Channel[] {
  const normalizedHashtagFilter = hashtagFilter.trim().toLowerCase();
  const filtered = channels
    .filter((channel) => channel.name.toLowerCase().includes(normalizedHashtagFilter))
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aExact = aName === normalizedHashtagFilter ? 1 : 0;
      const bExact = bName === normalizedHashtagFilter ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aPrefix = aName.startsWith(normalizedHashtagFilter) ? 1 : 0;
      const bPrefix = bName.startsWith(normalizedHashtagFilter) ? 1 : 0;
      if (aPrefix !== bPrefix) return bPrefix - aPrefix;

      if (aName.length !== bName.length) return aName.length - bName.length;

      const aIndex = aName.indexOf(normalizedHashtagFilter);
      const bIndex = bName.indexOf(normalizedHashtagFilter);
      if (aIndex !== bIndex) return aIndex - bIndex;

      return aName.localeCompare(bName);
    });

  if (typeof maxResults === "number") {
    return filtered.slice(0, maxResults);
  }

  return filtered;
}
