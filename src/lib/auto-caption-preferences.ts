const STORAGE_KEY_AUTO_CAPTION_ENABLED = "nodex_auto_caption_enabled";

export function loadAutoCaptionEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY_AUTO_CAPTION_ENABLED) === "true";
}

export function saveAutoCaptionEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_AUTO_CAPTION_ENABLED, enabled ? "true" : "false");
}
