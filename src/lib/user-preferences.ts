import {
  STORAGE_KEY_AUTO_CAPTION_ENABLED,
  STORAGE_KEY_COMPLETION_SOUND_ENABLED,
  STORAGE_KEY_PRESENCE_ENABLED,
  STORAGE_KEY_PUBLISH_DELAY_ENABLED,
} from "./storage-registry";

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
  return loadBooleanPref(STORAGE_KEY_PRESENCE_ENABLED, true);
}
export function savePresencePublishingEnabled(enabled: boolean): void {
  saveBooleanPref(STORAGE_KEY_PRESENCE_ENABLED, enabled);
}

export function loadAutoCaptionEnabled(): boolean {
  return loadBooleanPref(STORAGE_KEY_AUTO_CAPTION_ENABLED, false);
}
export function saveAutoCaptionEnabled(enabled: boolean): void {
  saveBooleanPref(STORAGE_KEY_AUTO_CAPTION_ENABLED, enabled);
}

export function loadPublishDelayEnabled(): boolean {
  return loadBooleanPref(STORAGE_KEY_PUBLISH_DELAY_ENABLED, false);
}
export function savePublishDelayEnabled(enabled: boolean): void {
  saveBooleanPref(STORAGE_KEY_PUBLISH_DELAY_ENABLED, enabled);
}

export function loadCompletionSoundEnabled(): boolean {
  return loadBooleanPref(STORAGE_KEY_COMPLETION_SOUND_ENABLED, true);
}
export function saveCompletionSoundEnabled(enabled: boolean): void {
  saveBooleanPref(STORAGE_KEY_COMPLETION_SOUND_ENABLED, enabled);
}
