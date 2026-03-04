const RELAY_URL_PATTERN = /\bwss?:\/\/[^\s,)]+/gi;

export function extractRelayUrlsFromErrorMessage(message: string): string[] {
  if (!message) return [];
  const matches = message.match(RELAY_URL_PATTERN) ?? [];
  const normalized = matches
    .map((url) => url.replace(/\/+$/, ""))
    .filter((url) => url.length > 0);
  return Array.from(new Set(normalized));
}
