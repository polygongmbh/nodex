import { safeLocalStorageSetItem, safeSessionStorageSetItem } from "@/lib/safe-local-storage";
import { isValidNoasBaseUrl, normalizeNoasBaseUrl } from "@/lib/nostr/noas-discovery";
import type { AuthMethod } from "./contracts";

type WindowWithNostr = Window & { nostr?: unknown };

export const STORAGE_KEY_AUTH = "nostr_auth_method";
export const STORAGE_KEY_NSEC = "nostr_guest_nsec";
export const STORAGE_KEY_NIP46_BUNKER = "nostr_nip46_bunker";
export const STORAGE_KEY_NIP46_LOCAL_NSEC = "nostr_nip46_local_nsec";
export const STORAGE_KEY_RELAYS = "nostr_relays";
export const STORAGE_KEY_NOAS_DEFAULT_HOST = "nostr_noas_default_host";
export const STORAGE_KEY_SESSION_PRIVATE_KEY = "nostr_session_private_key";
export const STORAGE_KEY_SESSION_NOAS_STATE = "nostr_session_noas_state";

interface NoasSessionState {
  apiBaseUrl: string;
  username: string;
  relayUrls?: string[];
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  return window.sessionStorage;
}

export const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function loadPersistedRelayUrls(): string[] | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY_RELAYS);
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
  const storage = getLocalStorage();
  if (!storage) return;
  const normalized = Array.from(
    new Set(
      urls
        .map((entry) => normalizeRelayUrl(entry))
        .filter((entry) => entry.length > 0)
    )
  );
  safeLocalStorageSetItem(STORAGE_KEY_RELAYS, JSON.stringify(normalized), {
    storage,
    context: "nostr-provider-relay-persistence",
  });
}

export function loadPersistedNoasDefaultHostUrl(): string {
  const storage = getLocalStorage();
  if (!storage) return "";
  const raw = storage.getItem(STORAGE_KEY_NOAS_DEFAULT_HOST);
  const normalized = normalizeNoasBaseUrl(raw || "");
  return isValidNoasBaseUrl(normalized) ? normalized : "";
}

export function savePersistedNoasDefaultHostUrl(url: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  const normalized = normalizeNoasBaseUrl(url);
  if (!isValidNoasBaseUrl(normalized)) return;

  safeLocalStorageSetItem(STORAGE_KEY_NOAS_DEFAULT_HOST, normalized, {
    storage,
    context: "nostr-provider-noas-default-host",
  });
}

export function loadStoredAuthMethod(): AuthMethod {
  const sessionStorage = getSessionStorage();
  const localStorage = getLocalStorage();

  const sessionAuth = sessionStorage?.getItem(STORAGE_KEY_AUTH) as AuthMethod | null;
  if (sessionAuth) return sessionAuth;

  return (localStorage?.getItem(STORAGE_KEY_AUTH) as AuthMethod | null) ?? null;
}

export function savePersistentAuthMethod(authMethod: Exclude<AuthMethod, "privateKey" | "noas" | null>): void {
  const storage = getLocalStorage();
  if (!storage) return;

  storage.removeItem(STORAGE_KEY_AUTH);
  const sessionStorage = getSessionStorage();
  sessionStorage?.removeItem(STORAGE_KEY_AUTH);

  safeLocalStorageSetItem(STORAGE_KEY_AUTH, authMethod, {
    storage,
    context: "nostr-provider-auth-persistent",
  });
}

export function saveSessionAuthMethod(authMethod: Extract<AuthMethod, "privateKey" | "noas">): void {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.removeItem(STORAGE_KEY_AUTH);
  const localStorage = getLocalStorage();
  localStorage?.removeItem(STORAGE_KEY_AUTH);

  safeSessionStorageSetItem(STORAGE_KEY_AUTH, authMethod, {
    storage,
    context: "nostr-provider-auth-session",
  });
}

export function clearStoredAuthMethod(): void {
  getLocalStorage()?.removeItem(STORAGE_KEY_AUTH);
  getSessionStorage()?.removeItem(STORAGE_KEY_AUTH);
}

export function loadSessionPrivateKey(): string | null {
  return getSessionStorage()?.getItem(STORAGE_KEY_SESSION_PRIVATE_KEY) ?? null;
}

export function saveSessionPrivateKey(privateKey: string): void {
  const normalized = privateKey.trim();
  if (!normalized) return;

  const storage = getSessionStorage();
  if (!storage) return;

  safeSessionStorageSetItem(STORAGE_KEY_SESSION_PRIVATE_KEY, normalized, {
    storage,
    context: "nostr-provider-session-private-key",
  });
}

export function clearSessionPrivateKey(): void {
  getSessionStorage()?.removeItem(STORAGE_KEY_SESSION_PRIVATE_KEY);
}

export function loadSessionNoasState(): NoasSessionState | null {
  const raw = getSessionStorage()?.getItem(STORAGE_KEY_SESSION_NOAS_STATE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<NoasSessionState>;
    const apiBaseUrl = normalizeNoasBaseUrl(parsed.apiBaseUrl || "");
    const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
    if (!apiBaseUrl || !username || !isValidNoasBaseUrl(apiBaseUrl)) return null;
    const relayUrls = Array.isArray(parsed.relayUrls)
      ? parsed.relayUrls.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : undefined;
    return { apiBaseUrl, username, relayUrls };
  } catch {
    return null;
  }
}

export function saveSessionNoasState(state: NoasSessionState): void {
  const storage = getSessionStorage();
  if (!storage) return;

  const apiBaseUrl = normalizeNoasBaseUrl(state.apiBaseUrl);
  const username = state.username.trim();
  if (!apiBaseUrl || !username || !isValidNoasBaseUrl(apiBaseUrl)) return;

  const payload: NoasSessionState = {
    apiBaseUrl,
    username,
    relayUrls: state.relayUrls?.filter((entry) => entry.trim().length > 0),
  };

  safeSessionStorageSetItem(STORAGE_KEY_SESSION_NOAS_STATE, JSON.stringify(payload), {
    storage,
    context: "nostr-provider-session-noas-state",
  });
}

export function clearSessionNoasState(): void {
  getSessionStorage()?.removeItem(STORAGE_KEY_SESSION_NOAS_STATE);
}
