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

interface NdkRelayErrorEntry {
  relayUrl?: string;
  message: string;
}

function toStringMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === "object" && value !== null) {
    const maybeMessage = (value as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return String(value || "");
}

function extractNdkRelayErrorEntries(error: unknown): NdkRelayErrorEntry[] {
  if (typeof error !== "object" || error === null) return [];
  const maybeErrors = (error as { errors?: unknown }).errors;
  if (!(maybeErrors instanceof Map)) return [];

  const entries: NdkRelayErrorEntry[] = [];
  for (const [relay, relayError] of maybeErrors.entries()) {
    const relayUrl = typeof relay === "object" && relay !== null && "url" in relay
      ? String((relay as { url?: unknown }).url || "")
      : undefined;
    entries.push({
      relayUrl: relayUrl || undefined,
      message: toStringMessage(relayError),
    });
  }
  return entries;
}

function extractReasonFromMessage(message: string): string | undefined {
  if (!message) return undefined;
  const okMatch = message.match(OK_REJECTION_PATTERN);
  if (okMatch?.[1]) return okMatch[1];
  const authMatch = message.match(AUTH_REQUIRED_REASON_PATTERN);
  if (authMatch?.[1]) return authMatch[1];
  return undefined;
}

export function extractRelayUrlsFromError(error: unknown): string[] {
  const candidates: string[] = [extractErrorMessage(error)];
  const ndkRelayErrors = extractNdkRelayErrorEntries(error);
  ndkRelayErrors.forEach((entry) => {
    if (entry.relayUrl) candidates.push(entry.relayUrl);
    candidates.push(entry.message);
  });

  if (typeof error === "object" && error !== null) {
    const relayErrorsText = (error as { relayErrors?: unknown }).relayErrors;
    if (typeof relayErrorsText === "string") candidates.push(relayErrorsText);
  }

  const merged = candidates.flatMap((candidate) => extractRelayUrlsFromErrorMessage(candidate));
  return Array.from(new Set(merged));
}

export function extractRelayRejectionReason(error: unknown): string | undefined {
  const candidates: string[] = [extractErrorMessage(error)];
  const ndkRelayErrors = extractNdkRelayErrorEntries(error);
  ndkRelayErrors.forEach((entry) => candidates.push(entry.message));
  if (typeof error === "object" && error !== null) {
    const relayErrorsText = (error as { relayErrors?: unknown }).relayErrors;
    if (typeof relayErrorsText === "string") candidates.push(relayErrorsText);
    const cause = (error as { cause?: unknown }).cause;
    if (cause) candidates.push(toStringMessage(cause));
  }

  for (const candidate of candidates) {
    const reason = extractReasonFromMessage(candidate);
    if (reason) return reason;
  }

  return undefined;
}
