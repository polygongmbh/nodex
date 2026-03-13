type WindowWithNostr = Window & { nostr?: unknown };

export const STORAGE_KEY_AUTH = "nostr_auth_method";
export const STORAGE_KEY_NSEC = "nostr_guest_nsec";
export const STORAGE_KEY_NIP46_BUNKER = "nostr_nip46_bunker";
export const STORAGE_KEY_NIP46_LOCAL_NSEC = "nostr_nip46_local_nsec";
export const STORAGE_KEY_RELAYS = "nostr_relays";

export const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function loadPersistedRelayUrls(): string[] | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY_RELAYS);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((entry) => (typeof entry === "string" ? normalizeRelayUrl(entry) : ""))
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(normalized));
  } catch {
    return [];
  }
}

export function savePersistedRelayUrls(urls: string[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const normalized = Array.from(
    new Set(
      urls
        .map((entry) => normalizeRelayUrl(entry))
        .filter((entry) => entry.length > 0)
    )
  );
  try {
    window.localStorage.setItem(STORAGE_KEY_RELAYS, JSON.stringify(normalized));
  } catch (error) {
    console.warn("Failed to persist relay URLs", {
      storageKey: STORAGE_KEY_RELAYS,
      relayCount: normalized.length,
      error,
    });
  }
}
