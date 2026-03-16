import { CHANNEL_FRECENCY_STORAGE_KEY } from "./storage-registry";
export { CHANNEL_FRECENCY_STORAGE_KEY };
const HALF_LIFE_DAYS = 14;
const HALF_LIFE_MS = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

export interface ChannelFrecencyEntry {
  score: number;
  lastInteractedAt: number;
}

export type ChannelFrecencyState = Record<string, ChannelFrecencyEntry>;

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadChannelFrecencyState(): ChannelFrecencyState {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(CHANNEL_FRECENCY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChannelFrecencyState;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveChannelFrecencyState(state: ChannelFrecencyState): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(CHANNEL_FRECENCY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore persistence failures.
  }
}

function decayScore(score: number, elapsedMs: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  if (elapsedMs <= 0) return score;
  const decayFactor = Math.pow(0.5, elapsedMs / HALF_LIFE_MS);
  return score * decayFactor;
}

export function recordChannelInteraction(
  state: ChannelFrecencyState,
  tag: string,
  weight = 1,
  now = Date.now()
): ChannelFrecencyState {
  const normalizedTag = normalizeTag(tag);
  if (!normalizedTag) return state;

  const previous = state[normalizedTag];
  const decayedScore = previous ? decayScore(previous.score, now - previous.lastInteractedAt) : 0;
  const clampedWeight = Math.max(0.1, Math.min(5, weight));
  const nextScore = Math.min(50, decayedScore + clampedWeight);
  return {
    ...state,
    [normalizedTag]: {
      score: nextScore,
      lastInteractedAt: now,
    },
  };
}

export function getChannelFrecencyScores(
  state: ChannelFrecencyState,
  now = Date.now()
): Map<string, number> {
  const scores = new Map<string, number>();
  Object.entries(state).forEach(([tag, entry]) => {
    if (!entry || !Number.isFinite(entry.score) || !Number.isFinite(entry.lastInteractedAt)) return;
    const decayed = decayScore(entry.score, now - entry.lastInteractedAt);
    if (decayed <= 0.05) return;
    scores.set(tag, decayed);
  });
  return scores;
}
