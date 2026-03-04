const RELAY_URL_PATTERN = /\bwss?:\/\/[^\s,)"'}\]]+/gi;
const OK_REJECTION_PATTERN = /\[\s*"OK"\s*,\s*"[^"]*"\s*,\s*false\s*,\s*"([^"]+)"\s*\]/i;
const AUTH_REQUIRED_REASON_PATTERN = /(auth-required:[^\]\n]+)/i;

export function extractRelayUrlsFromErrorMessage(message: string): string[] {
  if (!message) return [];
  const matches = message.match(RELAY_URL_PATTERN) ?? [];
  const normalized = matches
    .map((url) => url.replace(/\/+$/, ""))
    .filter((url) => url.length > 0);
  return Array.from(new Set(normalized));
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return String(error || "");
}

export function extractRelayUrlsFromError(error: unknown): string[] {
  const directMessage = extractErrorMessage(error);
  const fromDirectMessage = extractRelayUrlsFromErrorMessage(directMessage);
  if (fromDirectMessage.length > 0) return fromDirectMessage;
  if (typeof error === "object" && error !== null) {
    try {
      const serialized = JSON.stringify(error);
      return extractRelayUrlsFromErrorMessage(serialized);
    } catch {
      return [];
    }
  }
  return [];
}

export function extractRelayRejectionReason(error: unknown): string | undefined {
  const message = extractErrorMessage(error);
  if (!message) return undefined;

  const okMatch = message.match(OK_REJECTION_PATTERN);
  if (okMatch?.[1]) return okMatch[1];

  const authMatch = message.match(AUTH_REQUIRED_REASON_PATTERN);
  if (authMatch?.[1]) return authMatch[1];

  return undefined;
}
