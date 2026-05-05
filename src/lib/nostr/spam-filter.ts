const SPAM_KEYWORDS = [
  "🔞",
  "f4f",
  "crypto giveaway",
  "free btc",
  "free bitcoin",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SPAM_KEYWORD_REGEXES = SPAM_KEYWORDS.map(
  (keyword) =>
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(keyword)}(?:[^\\p{L}\\p{N}]|$)`, "iu")
);

export function findSpamKeyword(content: string): string | null {
  for (let i = 0; i < SPAM_KEYWORD_REGEXES.length; i++) {
    if (SPAM_KEYWORD_REGEXES[i].test(content)) return SPAM_KEYWORDS[i];
  }
  return null;
}

export function isSpamContent(content: string): boolean {
  return findSpamKeyword(content) !== null;
}
