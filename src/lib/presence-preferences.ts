const STORAGE_KEY_PRESENCE_ENABLED = "nodex_presence_enabled";

export function loadPresencePublishingEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY_PRESENCE_ENABLED);
  if (stored === null) return true;
  return stored !== "false";
}

export function savePresencePublishingEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PRESENCE_ENABLED, enabled ? "true" : "false");
}
