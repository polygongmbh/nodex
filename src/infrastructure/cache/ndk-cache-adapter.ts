import type {
  NDKCacheAdapter,
  NDKCacheRelayInfo,
  NDKEvent,
  NDKFilter,
  NDKRelay,
  NDKRelayInformation,
  NDKSubscription,
  ProfilePointer,
} from "@nostr-dev-kit/ndk";
import { NIP05_CACHE_STORAGE_KEY, RELAY_STATUS_CACHE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { summarizeRelayInfo, type RelayInfoSummary } from "@/infrastructure/nostr/relay-info";

export const RELAY_NIP11_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NIP05_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface Nip05CacheEntry {
  pointer: ProfilePointer | null;
  fetchedAt: number;
}

type Nip05Cache = Record<string, Nip05CacheEntry>;

function loadNip05Cache(): Nip05Cache {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(NIP05_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Nip05Cache;
  } catch {
    return {};
  }
}

function saveNip05Cache(cache: Nip05Cache): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(NIP05_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage persistence failures.
  }
}

interface PersistedRelayStatusEntry {
  nip11?: {
    document: NDKRelayInformation;
    fetchedAt: number;
  };
}

type PersistedRelayStatusCache = Record<string, PersistedRelayStatusEntry>;

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadPersistedRelayStatusCache(): PersistedRelayStatusCache {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(RELAY_STATUS_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const next: PersistedRelayStatusCache = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([relayUrl, candidate]) => {
      if (typeof relayUrl !== "string" || !relayUrl) return;
      if (!candidate || typeof candidate !== "object") return;
      const entry = candidate as { nip11?: unknown };
      if (!entry.nip11 || typeof entry.nip11 !== "object") {
        next[relayUrl] = {};
        return;
      }
      const nip11 = entry.nip11 as { document?: unknown; fetchedAt?: unknown };
      if (
        !nip11.document ||
        typeof nip11.document !== "object" ||
        typeof nip11.fetchedAt !== "number" ||
        !Number.isFinite(nip11.fetchedAt)
      ) {
        // Drop legacy/invalid entries; a fresh probe will repopulate.
        next[relayUrl] = {};
        return;
      }
      next[relayUrl] = {
        nip11: {
          document: nip11.document as NDKRelayInformation,
          fetchedAt: nip11.fetchedAt,
        },
      };
    });
    return next;
  } catch {
    return {};
  }
}

function savePersistedRelayStatusCache(cache: PersistedRelayStatusCache): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(RELAY_STATUS_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage persistence failures.
  }
}

function cachedRelayStatusToSummary(
  status: NDKCacheRelayInfo
): { summary: RelayInfoSummary; fetchedAt: number } | null {
  if (!status.nip11) return null;
  const fetchedAt = status.nip11.fetchedAt;
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return null;
  return {
    summary: summarizeRelayInfo(status.nip11.data),
    fetchedAt,
  };
}

export function getFreshRelayInfoSummaryFromCache(
  status: NDKCacheRelayInfo | undefined,
  options?: { now?: number; maxAgeMs?: number }
): { summary: RelayInfoSummary; fetchedAt: number } | null {
  if (!status) return null;
  const cached = cachedRelayStatusToSummary(status);
  if (!cached) return null;

  const now = options?.now ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? RELAY_NIP11_CACHE_TTL_MS;
  if (now - cached.fetchedAt > maxAgeMs) return null;
  return cached;
}

export function createNodexCacheAdapter(): NDKCacheAdapter {
  return {
    locking: false,
    ready: true,
    query(_subscription: NDKSubscription): NDKEvent[] {
      return [];
    },
    async setEvent(_event: NDKEvent, _filters: NDKFilter[], _relay?: NDKRelay): Promise<void> {
      // Relay status caching is handled through getRelayStatus/updateRelayStatus only.
    },
    async loadNip05(nip05: string): Promise<ProfilePointer | null | "missing"> {
      const cache = loadNip05Cache();
      const entry = cache[nip05];
      if (!entry) return "missing";
      if (Date.now() - entry.fetchedAt > NIP05_CACHE_TTL_MS) return "missing";
      return entry.pointer;
    },
    saveNip05(nip05: string, pointer: ProfilePointer | null): void {
      const cache = loadNip05Cache();
      cache[nip05] = { pointer, fetchedAt: Date.now() };
      saveNip05Cache(cache);
    },
    updateRelayStatus(relayUrl, info) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) return;

      const cache = loadPersistedRelayStatusCache();

      if (!info || Object.keys(info).length === 0) {
        delete cache[normalizedRelayUrl];
        savePersistedRelayStatusCache(cache);
        return;
      }

      if (!info.nip11) {
        return;
      }

      cache[normalizedRelayUrl] = {
        ...(cache[normalizedRelayUrl] || {}),
        nip11: {
          document: info.nip11.data,
          fetchedAt: info.nip11.fetchedAt,
        },
      };

      savePersistedRelayStatusCache(cache);
    },
    getRelayStatus(relayUrl) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (!normalizedRelayUrl) return undefined;

      const cache = loadPersistedRelayStatusCache();
      const entry = cache[normalizedRelayUrl];
      if (!entry?.nip11) return undefined;

      return {
        nip11: {
          data: entry.nip11.document,
          fetchedAt: entry.nip11.fetchedAt,
        },
      };
    },
  };
}
