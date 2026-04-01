import {
  AUTO_CAPTION_ENABLED_STORAGE_KEY,
  COMPACT_TASK_CARDS_ENABLED_STORAGE_KEY,
  COMPLETION_SOUND_ENABLED_STORAGE_KEY,
  PRESENCE_ENABLED_STORAGE_KEY,
  PUBLISH_DELAY_ENABLED_STORAGE_KEY,
  REDUCED_DATA_MODE_STORAGE_KEY,
} from "@/infrastructure/preferences/storage-registry";

function loadBooleanPref(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return defaultValue;
  return stored !== "false";
}

function saveBooleanPref(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "true" : "false");
}

export type ReducedDataMode = "auto" | "on" | "off";

function isReducedDataMode(value: string | null): value is ReducedDataMode {
  return value === "auto" || value === "on" || value === "off";
}

export function loadPresencePublishingEnabled(): boolean {
  return loadBooleanPref(PRESENCE_ENABLED_STORAGE_KEY, true);
}
export function savePresencePublishingEnabled(enabled: boolean): void {
  saveBooleanPref(PRESENCE_ENABLED_STORAGE_KEY, enabled);
}

export function loadAutoCaptionEnabled(): boolean {
  return loadBooleanPref(AUTO_CAPTION_ENABLED_STORAGE_KEY, false);
}
export function saveAutoCaptionEnabled(enabled: boolean): void {
  saveBooleanPref(AUTO_CAPTION_ENABLED_STORAGE_KEY, enabled);
}

export function loadPublishDelayEnabled(): boolean {
  return loadBooleanPref(PUBLISH_DELAY_ENABLED_STORAGE_KEY, false);
}
export function savePublishDelayEnabled(enabled: boolean): void {
  saveBooleanPref(PUBLISH_DELAY_ENABLED_STORAGE_KEY, enabled);
}

export function loadCompletionSoundEnabled(): boolean {
  return loadBooleanPref(COMPLETION_SOUND_ENABLED_STORAGE_KEY, true);
}
export function saveCompletionSoundEnabled(enabled: boolean): void {
  saveBooleanPref(COMPLETION_SOUND_ENABLED_STORAGE_KEY, enabled);
}

export function loadCompactTaskCardsEnabled(): boolean {
  return loadBooleanPref(COMPACT_TASK_CARDS_ENABLED_STORAGE_KEY, false);
}
export function saveCompactTaskCardsEnabled(enabled: boolean): void {
  saveBooleanPref(COMPACT_TASK_CARDS_ENABLED_STORAGE_KEY, enabled);
}

export function loadReducedDataMode(): ReducedDataMode {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem(REDUCED_DATA_MODE_STORAGE_KEY);
  if (!isReducedDataMode(stored)) return "auto";
  return stored;
}

export function saveReducedDataMode(mode: ReducedDataMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REDUCED_DATA_MODE_STORAGE_KEY, mode);
}
