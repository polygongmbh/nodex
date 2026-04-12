export const HASHTAG_CONTENT_REGEX = /(^|\s)#([A-Za-z0-9_]+)/g;
export const HASHTAG_AT_CURSOR_REGEX = /(^|\s)#([A-Za-z0-9_]*)$/;
export const MENTION_CONTENT_REGEX = /(^|\s)@([a-zA-Z0-9._-]+(?:@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?)/g;
export const MENTION_AT_CURSOR_REGEX = /(^|\s)@([^\s@]*)$/;
export const LINKIFY_CONTENT_TOKEN_REGEX =
  /(^|\s)(#([A-Za-z0-9_]+)|@([A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?)|nostr:(npub1[023456789acdefghjklmnpqrstuvwxyz]+))/gi;

export function stripStandaloneMentionsAndHashtags(content: string): string {
  return content
    .replace(HASHTAG_CONTENT_REGEX, "$1 ")
    .replace(MENTION_CONTENT_REGEX, "$1 ");
}
