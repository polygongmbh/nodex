const STORAGE_KEY_PUBLISH_DELAY_ENABLED = "nodex_publish_delay_enabled";

export function loadPublishDelayEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY_PUBLISH_DELAY_ENABLED);
  if (stored === null) return false;
  return stored !== "false";
}

export function savePublishDelayEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PUBLISH_DELAY_ENABLED, enabled ? "true" : "false");
}
