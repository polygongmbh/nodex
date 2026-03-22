import { PERSON_FRECENCY_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

export { PERSON_FRECENCY_STORAGE_KEY };

const HALF_LIFE_DAYS = 14;
const HALF_LIFE_MS = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

export interface PersonFrecencyEntry {
  score: number;
  lastInteractedAt: number;
}

export type PersonFrecencyState = Record<string, PersonFrecencyEntry>;

function normalizePersonId(value: string): string {
  return value.trim().toLowerCase();
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadPersonFrecencyState(): PersonFrecencyState {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(PERSON_FRECENCY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersonFrecencyState;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function savePersonFrecencyState(state: PersonFrecencyState): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(PERSON_FRECENCY_STORAGE_KEY, JSON.stringify(state));
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

export function recordPersonInteraction(
  state: PersonFrecencyState,
  personId: string,
  weight = 1,
  now = Date.now()
): PersonFrecencyState {
  const normalizedPersonId = normalizePersonId(personId);
  if (!normalizedPersonId) return state;

  const previous = state[normalizedPersonId];
  const decayedScore = previous ? decayScore(previous.score, now - previous.lastInteractedAt) : 0;
  const clampedWeight = Math.max(0.1, Math.min(5, weight));
  const nextScore = Math.min(50, decayedScore + clampedWeight);
  return {
    ...state,
    [normalizedPersonId]: {
      score: nextScore,
      lastInteractedAt: now,
    },
  };
}

export function getPersonFrecencyScores(
  state: PersonFrecencyState,
  now = Date.now()
): Map<string, number> {
  const scores = new Map<string, number>();
  Object.entries(state).forEach(([personId, entry]) => {
    if (!entry || !Number.isFinite(entry.score) || !Number.isFinite(entry.lastInteractedAt)) return;
    const decayed = decayScore(entry.score, now - entry.lastInteractedAt);
    if (decayed <= 0.05) return;
    scores.set(personId, decayed);
  });
  return scores;
}
