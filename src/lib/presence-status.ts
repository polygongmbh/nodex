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
