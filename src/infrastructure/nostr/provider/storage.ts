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

type PersistedNoasHostMap = Record<string, string>;

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

function readPersistedNoasHostMap(): PersistedNoasHostMap {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const raw = window.localStorage.getItem(STORAGE_KEY_NOAS_DEFAULT_HOST);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([scopeKey, value]) => {
          const normalizedScopeKey = scopeKey.trim().toLowerCase();
          const normalizedValue = typeof value === "string" ? normalizeNoasBaseUrl(value) : "";
          return [normalizedScopeKey, normalizedValue];
        })
        .filter(([scopeKey, normalizedValue]) => scopeKey && isValidNoasBaseUrl(normalizedValue))
    );
  } catch {
    return {};
  }
}

export function loadPersistedNoasDefaultHostUrl(scopeKey = "default"): string {
  const normalizedScopeKey = scopeKey.trim().toLowerCase();
  if (!normalizedScopeKey) return "";

  const persistedHosts = readPersistedNoasHostMap();
  return persistedHosts[normalizedScopeKey] || "";
}

export function savePersistedNoasDefaultHostUrl(url: string, scopeKey = "default"): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const normalizedScopeKey = scopeKey.trim().toLowerCase();
  if (!normalizedScopeKey) return;

  const normalized = normalizeNoasBaseUrl(url);
  if (!isValidNoasBaseUrl(normalized)) return;

  const persistedHosts = readPersistedNoasHostMap();
  const nextPersistedHosts = {
    ...persistedHosts,
    [normalizedScopeKey]: normalized,
  };

  safeLocalStorageSetItem(STORAGE_KEY_NOAS_DEFAULT_HOST, JSON.stringify(nextPersistedHosts), {
    context: "nostr-provider-noas-default-host",
  });
}
