const MOTD_ENV_KEY = "VITE_NODEX_MOTD";

export function resolveMotd(env: Record<string, unknown> = import.meta.env): string | null {
  const raw = env[MOTD_ENV_KEY];
  const motd = typeof raw === "string" ? raw.trim() : "";
  return motd.length > 0 ? motd : null;
}

export const MOTD_DISMISS_STORAGE_KEY_PREFIX = "nodex.motd.dismissed.v1:";

export function getMotdDismissStorageKey(motd: string): string {
  return `${MOTD_DISMISS_STORAGE_KEY_PREFIX}${motd}`;
}
