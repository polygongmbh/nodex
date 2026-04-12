import { stripStandaloneMentionsAndHashtags } from "@/lib/content-tokens";

const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/u;

export function hasMeaningfulComposerText(content: string): boolean {
  return LETTER_OR_DIGIT_PATTERN.test(stripStandaloneMentionsAndHashtags(content));
}
