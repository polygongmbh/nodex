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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectStringLeaves(value: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof value === "string") return [value];
  if (!isObjectLike(value)) return [String(value)];
  if (seen.has(value)) return [];
  seen.add(value);

  if (value instanceof Map) {
    return [...value.entries()].flatMap(([key, mapValue]) => [
      ...collectStringLeaves(key, seen),
      ...collectStringLeaves(mapValue, seen),
    ]);
  }

  if (value instanceof Set) {
    return [...value.values()].flatMap((entry) => collectStringLeaves(entry, seen));
  }

  const ownValues = Reflect.ownKeys(value).map((key) => {
    try {
      return (value as Record<PropertyKey, unknown>)[key];
    } catch {
      return undefined;
    }
  });
  const values = Array.isArray(value) ? [...value, ...ownValues] : ownValues;
  return values.flatMap((entry) => collectStringLeaves(entry, seen));
}

function collectOkTupleReasons(value: unknown, seen = new WeakSet<object>()): string[] {
  if (!isObjectLike(value)) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    const directReason =
      value.length >= 4 &&
      value[0] === "OK" &&
      value[2] === false &&
      typeof value[3] === "string"
        ? [value[3]]
        : [];
    return [...directReason, ...value.flatMap((entry) => collectOkTupleReasons(entry, seen))];
  }

  if (value instanceof Map) {
    return [...value.entries()].flatMap(([key, mapValue]) => [
      ...collectOkTupleReasons(key, seen),
      ...collectOkTupleReasons(mapValue, seen),
    ]);
  }

  if (value instanceof Set) {
    return [...value.values()].flatMap((entry) => collectOkTupleReasons(entry, seen));
  }

  const values = Reflect.ownKeys(value).map((key) => {
    try {
      return (value as Record<PropertyKey, unknown>)[key];
    } catch {
      return undefined;
    }
  });
  return values.flatMap((entry) => collectOkTupleReasons(entry, seen));
}

export function extractRelayUrlsFromError(error: unknown): string[] {
  const directMessage = extractErrorMessage(error);
  const fromDirectMessage = extractRelayUrlsFromErrorMessage(directMessage);
  if (fromDirectMessage.length > 0) return fromDirectMessage;
  const leafCandidates = collectStringLeaves(error);
  const merged = leafCandidates.flatMap((candidate) => extractRelayUrlsFromErrorMessage(candidate));
  return Array.from(new Set(merged.map((url) => url.replace(/\/+$/, ""))));
}

export function extractRelayRejectionReason(error: unknown): string | undefined {
  const tupleReason = collectOkTupleReasons(error)[0];
  if (tupleReason) return tupleReason;

  const candidates = [extractErrorMessage(error), ...collectStringLeaves(error)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const okMatch = candidate.match(OK_REJECTION_PATTERN);
    if (okMatch?.[1]) return okMatch[1];
    const authMatch = candidate.match(AUTH_REQUIRED_REASON_PATTERN);
    if (authMatch?.[1]) return authMatch[1];
  }

  return undefined;
}
