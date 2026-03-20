import type {
  NDKCacheAdapter,
  NDKCacheRelayInfo,
  NDKEvent,
  NDKFilter,
  NDKRelay,
  NDKRelayInformation,
  NDKSubscription,
} from "@nostr-dev-kit/ndk";
import { RELAY_STATUS_CACHE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { summarizeRelayInfo, type RelayInfoSummary } from "@/infrastructure/nostr/relay-info";

export const RELAY_NIP11_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface PersistedRelayStatusEntry {
  nip11?: {
    authRequired: boolean;
    supportsNip42: boolean;
    fetchedAt: number;
  };
}

type PersistedRelayStatusCache = Record<string, PersistedRelayStatusEntry>;

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
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
      const nip11 = entry.nip11 as {
        authRequired?: unknown;
        supportsNip42?: unknown;
        fetchedAt?: unknown;
      };
      if (
        typeof nip11.authRequired !== "boolean" ||
        typeof nip11.supportsNip42 !== "boolean" ||
        typeof nip11.fetchedAt !== "number" ||
        !Number.isFinite(nip11.fetchedAt)
      ) {
        next[relayUrl] = {};
        return;
      }
      next[relayUrl] = {
        nip11: {
          authRequired: nip11.authRequired,
          supportsNip42: nip11.supportsNip42,
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

export function relayInfoSummaryToNip11Document(info: RelayInfoSummary): NDKRelayInformation {
  return {
    supported_nips: info.supportsNip42 ? [42] : [],
    limitation: {
      auth_required: info.authRequired,
    },
  };
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

      const summary = summarizeRelayInfo(info.nip11.data);
      cache[normalizedRelayUrl] = {
        ...(cache[normalizedRelayUrl] || {}),
        nip11: {
          authRequired: summary.authRequired,
          supportsNip42: summary.supportsNip42,
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
          data: relayInfoSummaryToNip11Document({
            authRequired: entry.nip11.authRequired,
            supportsNip42: entry.nip11.supportsNip42,
          }),
          fetchedAt: entry.nip11.fetchedAt,
        },
      };
    },
  };
}
