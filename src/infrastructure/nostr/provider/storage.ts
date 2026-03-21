import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";
import { isValidNoasBaseUrl, normalizeNoasBaseUrl } from "@/lib/nostr/noas-client";

type WindowWithNostr = Window & { nostr?: unknown };

export const STORAGE_KEY_AUTH = "nostr_auth_method";
export const STORAGE_KEY_NSEC = "nostr_guest_nsec";
export const STORAGE_KEY_NIP46_BUNKER = "nostr_nip46_bunker";
export const STORAGE_KEY_NIP46_LOCAL_NSEC = "nostr_nip46_local_nsec";
export const STORAGE_KEY_RELAYS = "nostr_relays";
export const STORAGE_KEY_NOAS_USERNAME = "nostr_noas_username";
export const STORAGE_KEY_NOAS_DEFAULT_HOST = "nostr_noas_default_host";

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
  safeLocalStorageSetItem(STORAGE_KEY_RELAYS, JSON.stringify(normalized), {
    context: "nostr-provider-relay-persistence",
  });
}

export function loadPersistedNoasDefaultHostUrl(): string {
  if (typeof window === "undefined" || !window.localStorage) return "";
  const raw = window.localStorage.getItem(STORAGE_KEY_NOAS_DEFAULT_HOST);
  const normalized = normalizeNoasBaseUrl(raw || "");
  return isValidNoasBaseUrl(normalized) ? normalized : "";
}

export function savePersistedNoasDefaultHostUrl(url: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const normalized = normalizeNoasBaseUrl(url);
  if (!isValidNoasBaseUrl(normalized)) return;

  safeLocalStorageSetItem(STORAGE_KEY_NOAS_DEFAULT_HOST, normalized, {
    context: "nostr-provider-noas-default-host",
  });
}
