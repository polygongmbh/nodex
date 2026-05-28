export const HASHTAG_CONTENT_REGEX = /(^|\s)#([A-Za-z0-9_]+)/g;
export const HASHTAG_AT_CURSOR_REGEX = /(^|\s)#([A-Za-z0-9_]*)$/;
export const MENTION_CONTENT_REGEX = /(^|\s)@([a-zA-Z0-9._-]+(?:@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?)/g;
export const MENTION_AT_CURSOR_REGEX = /(^|\s)@([^\s@]*)$/;
export const LINKIFY_CONTENT_TOKEN_REGEX =
  /(^|\s)(#([A-Za-z0-9_]+)|@([A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)|nostr:((?:npub1|nprofile1|note1|nevent1|naddr1)[023456789acdefghjklmnpqrstuvwxyz]+))/gi;

/**
 * Hex color token recognizer (the `#XXX` payload, without the leading `#`).
 * A token counts as a hex color iff it is 3/4/6/8 hex chars, contains no
 * lowercase letters, and includes at least one A–F. This lets users keep
 * lowercase tags like `#fee` while writing color codes as `#FEE` naturally.
 */
export function isHexColorToken(hex: string): boolean {
  if (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8) return false;
  if (!/^[0-9A-F]+$/.test(hex)) return false;
  return /[A-F]/.test(hex);
}

export function stripStandaloneMentionsAndHashtags(content: string): string {
  return content
    .replace(HASHTAG_CONTENT_REGEX, "$1 ")
    .replace(MENTION_CONTENT_REGEX, "$1 ");
}
