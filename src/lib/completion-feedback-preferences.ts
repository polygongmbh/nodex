const STORAGE_KEY_COMPLETION_SOUND_ENABLED = "nodex_completion_sound_enabled";

export function loadCompletionSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY_COMPLETION_SOUND_ENABLED);
  if (stored === null) return true;
  return stored !== "false";
}

export function saveCompletionSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_COMPLETION_SOUND_ENABLED, enabled ? "true" : "false");
}
