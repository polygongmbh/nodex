import { HASHTAG_AT_CURSOR_REGEX, HASHTAG_CONTENT_REGEX } from "@/lib/content-tokens";

export function extractHashtagsFromContent(content: string): string[] {
  const hashtags = new Set<string>();

  for (const match of content.matchAll(HASHTAG_CONTENT_REGEX)) {
    const hashtag = match[2]?.toLowerCase();
    if (!hashtag) continue;
    hashtags.add(hashtag);
  }

  return Array.from(hashtags);
}

export function countHashtagsInContent(content: string): number {
  let count = 0;

  for (const _match of content.matchAll(HASHTAG_CONTENT_REGEX)) {
    count += 1;
  }

  return count;
}

export function getHashtagQueryAtCursor(textBeforeCursor: string): string | null {
  const match = textBeforeCursor.match(HASHTAG_AT_CURSOR_REGEX);
  const hashtag = match?.[2]?.toLowerCase();
  return hashtag ?? null;
}

export function extractCommittedHashtags(content: string): string[] {
  const hashtags = new Set<string>();

  for (const match of content.matchAll(HASHTAG_CONTENT_REGEX)) {
    const fullMatch = match[0];
    const hashtag = match[2]?.toLowerCase();
    if (!fullMatch || !hashtag) continue;
    const endIndex = match.index + fullMatch.length;
    const nextCharacter = content[endIndex] ?? "";
    if (nextCharacter && !/\s/.test(nextCharacter)) continue;
    hashtags.add(hashtag);
  }

  return Array.from(hashtags);
}
