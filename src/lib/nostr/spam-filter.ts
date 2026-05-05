const SPAM_KEYWORDS = [
  "onlyfans",
  "xxx",
  "porn",
  "nude",
  "nudes",
  "nsfw",
  "sex",
  "sexy",
  "horny",
  "adult content",
  "18+",
  "🔞",
  "pussy",
  "cock",
  "boobs",
  "tits",
  "milf",
  "fuck",
  "fucking",
  "blowjob",
  "handjob",
  "escort",
  "hookup",
  "airdrop",
  "giveaway",
  "free money",
  "click here",
  "act now",
  "limited time",
  "dm me",
  "dm for",
  "follow back",
  "f4f",
  "follow me",
  "check my",
  "visit my",
  "get rich",
  "make money",
  "earn money",
  "crypto giveaway",
  "free btc",
  "free bitcoin",
  "telegram",
  "whatsapp",
  "signal group",
  "join my",
  "subscribe to",
  "casino",
  "betting",
  "gambling",
  "lottery",
  "jackpot",
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
