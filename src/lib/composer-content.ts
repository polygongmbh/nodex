const HASHTAG_TOKEN_PATTERN = /(^|\s)#[\w-]+/g;
const MENTION_TOKEN_PATTERN = /(^|\s)@[^\s]+/g;
const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/u;

export function hasMeaningfulComposerText(content: string): boolean {
  const withoutHashtags = content.replace(HASHTAG_TOKEN_PATTERN, " ");
  const withoutTokens = withoutHashtags.replace(MENTION_TOKEN_PATTERN, " ");
  return LETTER_OR_DIGIT_PATTERN.test(withoutTokens);
}
