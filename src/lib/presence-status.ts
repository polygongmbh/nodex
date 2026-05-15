import type { PersonPresenceSnapshot } from "@/types/person";

export const NIP38_PRESENCE_TAG = "nodex-presence";
export const NODEX_PRESENCE_VIEW_TAG = "nodex-view";

// Thresholds for displaying presence indicators in the sidebar.
// ONLINE (green) = recently seen within a short window.
// RECENT (yellow) = seen within the broader recency window.
export const PRESENCE_ONLINE_WINDOW_MS = 3 * 60 * 1000;
export const PRESENCE_RECENT_WINDOW_MS = 30 * 60 * 1000;

type PresenceState = "active" | "offline";

export interface LatestPresenceSnapshot {
  reportedAtMs: number;
  state: PresenceState;
  view?: string;
  taskId?: string | null;
}

export function buildActivePresenceTags(view: string, taskId: string | null): string[][] {
  const tags: string[][] = [
    ["d", NIP38_PRESENCE_TAG],
    [NODEX_PRESENCE_VIEW_TAG, view],
  ];
  if (taskId) tags.push(["e", taskId]);
  return tags;
}

export function buildOfflinePresenceTags(): string[][] {
  return [["d", NIP38_PRESENCE_TAG]];
}

export function isNodexPresenceEvent(tags: string[][]): boolean {
  return tags.some((tag) => tag[0] === "d" && tag[1] === NIP38_PRESENCE_TAG);
}

interface ParsedPresence {
  state: PresenceState;
  view?: string;
  taskId?: string | null;
}

export function parsePresenceTags(tags: string[][]): ParsedPresence | null {
  if (!isNodexPresenceEvent(tags)) return null;
  const viewTag = tags.find((tag) => tag[0] === NODEX_PRESENCE_VIEW_TAG);
  const view = typeof viewTag?.[1] === "string" && viewTag[1].length > 0 ? viewTag[1] : undefined;
  if (!view) return { state: "offline" };
  const eTag = tags.find((tag) => tag[0] === "e");
  const taskId = typeof eTag?.[1] === "string" && eTag[1].length > 0 ? eTag[1] : null;
  return { state: "active", view, taskId };
}

interface PresenceLikeEvent {
  pubkey?: string;
  created_at?: number;
  tags: string[][];
}

export function deriveLatestPresenceByAuthor(
  events: PresenceLikeEvent[],
): Map<string, LatestPresenceSnapshot> {
  const latestPresenceByAuthor = new Map<string, LatestPresenceSnapshot>();

  for (const event of events) {
    const authorId = event.pubkey?.trim().toLowerCase();
    if (!authorId) continue;

    const presence = parsePresenceTags(event.tags);
    if (!presence) continue;

    const createdAtMs = (event.created_at || 0) * 1000;
    const previous = latestPresenceByAuthor.get(authorId);
    if (!previous || createdAtMs >= previous.reportedAtMs) {
      latestPresenceByAuthor.set(authorId, {
        reportedAtMs: createdAtMs,
        state: presence.state,
        view: presence.view,
        taskId: presence.taskId,
      });
    }
  }

  return latestPresenceByAuthor;
}

/**
 * Single source of truth for turning the raw NIP-38 presence signal (and any
 * recent activity timestamp) into the online/recent/offline state shown in
 * UI surfaces. Used by both the sidebar list and the hover card so they
 * cannot disagree.
 */
export function derivePersonPresenceSnapshot(
  latestPresence: LatestPresenceSnapshot | undefined,
  latestActivityMs: number | undefined,
  now: Date,
): PersonPresenceSnapshot {
  const nowMs = now.getTime();
  const latestPresenceTimestampMs =
    latestPresence?.state === "active" ? latestPresence.reportedAtMs : undefined;
  const combinedTimestampMs = Math.max(
    latestActivityMs ?? Number.NEGATIVE_INFINITY,
    latestPresenceTimestampMs ?? Number.NEGATIVE_INFINITY,
  );
  const ageMs =
    combinedTimestampMs === Number.NEGATIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : nowMs - combinedTimestampMs;
  const state: PersonPresenceSnapshot["state"] =
    latestPresence?.state === "offline"
      ? "offline"
      : ageMs <= PRESENCE_ONLINE_WINDOW_MS
        ? "online"
        : ageMs <= PRESENCE_RECENT_WINDOW_MS
          ? "recent"
          : "offline";
  return {
    state,
    reportedAtMs: latestPresence?.reportedAtMs,
    context:
      latestPresence?.state === "active"
        ? { view: latestPresence.view, taskId: latestPresence.taskId ?? null }
        : undefined,
  };
}

export function deriveLatestActivePresenceByAuthor(
  events: PresenceLikeEvent[],
): Map<string, number> {
  const latestPresenceByAuthor = deriveLatestPresenceByAuthor(events);
  const latestActivePresenceByAuthor = new Map<string, number>();
  for (const [authorId, snapshot] of latestPresenceByAuthor.entries()) {
    if (snapshot.state === "active") {
      latestActivePresenceByAuthor.set(authorId, snapshot.reportedAtMs);
    }
  }

  return latestActivePresenceByAuthor;
}
