export const NIP38_PRESENCE_TAG = "nodex-presence";
export const NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS = 60 * 60;
export const NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS = 60;

type PresenceState = "active" | "offline";

export interface PresenceContent {
  state: PresenceState;
  view?: string;
  taskId?: string | null;
}

export function buildPresenceTags(expirationUnix: number): string[][] {
  return [
    ["d", NIP38_PRESENCE_TAG],
    ["expiration", String(expirationUnix)],
  ];
}

export function buildActivePresenceContent(view: string, taskId: string | null): string {
  return JSON.stringify({
    state: "active",
    view,
    taskId,
  } satisfies PresenceContent);
}

export function buildOfflinePresenceContent(): string {
  return JSON.stringify({
    state: "offline",
  } satisfies PresenceContent);
}

export function getPresenceExpirationUnix(tags: string[][]): number | null {
  const raw = tags.find((tag) => tag[0] === "expiration")?.[1];
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

export function isNodexPresenceEvent(tags: string[][]): boolean {
  return tags.some((tag) => tag[0] === "d" && tag[1] === NIP38_PRESENCE_TAG);
}

export function parsePresenceContent(content: string): PresenceContent | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Partial<PresenceContent>;
    if (parsed.state !== "active" && parsed.state !== "offline") return null;
    return {
      state: parsed.state,
      view: typeof parsed.view === "string" ? parsed.view : undefined,
      taskId: typeof parsed.taskId === "string" || parsed.taskId === null ? parsed.taskId : undefined,
    };
  } catch {
    return null;
  }
}

interface PresenceLikeEvent {
  pubkey?: string;
  created_at?: number;
  tags: string[][];
  content?: string;
}

interface PresenceStateSnapshot {
  createdAtMs: number;
  state: PresenceState;
}

export function deriveLatestActivePresenceByAuthor(
  events: PresenceLikeEvent[],
  nowUnix: number
): Map<string, number> {
  const latestPresenceByAuthor = new Map<string, PresenceStateSnapshot>();

  for (const event of events) {
    const authorId = event.pubkey?.trim().toLowerCase();
    if (!authorId || !isNodexPresenceEvent(event.tags)) continue;

    const expirationUnix = getPresenceExpirationUnix(event.tags);
    if (expirationUnix !== null && expirationUnix < nowUnix) continue;

    const presence = parsePresenceContent(event.content || "");
    if (!presence) continue;

    const createdAtMs = (event.created_at || 0) * 1000;
    const previous = latestPresenceByAuthor.get(authorId);
    if (!previous || createdAtMs >= previous.createdAtMs) {
      latestPresenceByAuthor.set(authorId, {
        createdAtMs,
        state: presence.state,
      });
    }
  }

  const latestActivePresenceByAuthor = new Map<string, number>();
  for (const [authorId, snapshot] of latestPresenceByAuthor.entries()) {
    if (snapshot.state === "active") {
      latestActivePresenceByAuthor.set(authorId, snapshot.createdAtMs);
    }
  }

  return latestActivePresenceByAuthor;
}
