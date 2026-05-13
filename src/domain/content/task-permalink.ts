export interface BuildTaskPermalinkInput {
  origin: string;
  eventId: string;
  taskRelayUrls: string[];
  activeRelayUrls?: string[];
}

/**
 * Permalink shape: `${origin}/${relayHost}/${eventId}`.
 *
 * Relay selection prefers a relay both the event was seen on and the user has
 * currently active; falls back to the first event-relay; then to a bare
 * permalink without a relay segment.
 */
export function buildTaskPermalink(input: BuildTaskPermalinkInput): string {
  const origin = stripTrailingSlash(input.origin);
  const eventId = input.eventId.trim();
  if (!eventId) return origin;

  const relayHost = pickRelayHost(input.taskRelayUrls, input.activeRelayUrls);
  if (!relayHost) return `${origin}/${eventId}`;
  return `${origin}/${encodeURIComponent(relayHost)}/${eventId}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function pickRelayHost(taskRelayUrls: string[], activeRelayUrls?: string[]): string | null {
  const activeSet = new Set((activeRelayUrls || []).map(normalizeRelayUrl).filter(Boolean));
  for (const url of taskRelayUrls) {
    const normalized = normalizeRelayUrl(url);
    if (normalized && activeSet.has(normalized)) {
      return toHost(normalized);
    }
  }
  for (const url of taskRelayUrls) {
    const host = toHost(normalizeRelayUrl(url));
    if (host) return host;
  }
  return null;
}

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function toHost(normalizedUrl: string): string {
  if (!normalizedUrl) return "";
  try {
    return new URL(normalizedUrl).host;
  } catch {
    return normalizedUrl.replace(/^wss?:\/\//, "");
  }
}
