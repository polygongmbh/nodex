import {
  AUTO_CAPTION_ENABLED_STORAGE_KEY,
  COMPLETION_SOUND_ENABLED_STORAGE_KEY,
  PRESENCE_ENABLED_STORAGE_KEY,
  PUBLISH_DELAY_ENABLED_STORAGE_KEY,
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
