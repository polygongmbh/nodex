import { useCallback, useMemo, useRef } from "react";
import type { NDKCacheRelayInfo } from "@nostr-dev-kit/ndk";
import {
  createNodexCacheAdapter,
  getFreshRelayInfoSummaryFromCache,
  RELAY_NIP11_CACHE_TTL_MS,
  relayInfoSummaryToNip11Document,
} from "@/infrastructure/cache/ndk-cache-adapter";
import { fetchRelayInfo, type RelayInfoSummary } from "@/infrastructure/nostr/relay-info";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { NDKRelayStatus } from "./contracts";

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

interface UseRelayNip11Args {
  updateRelayEntry: (
    normalizedRelayUrl: string,
    transform: (relay: NDKRelayStatus) => NDKRelayStatus
  ) => void;
}

export function useRelayNip11({ updateRelayEntry }: UseRelayNip11Args) {
  const relayInfoRef = useRef<Map<string, RelayInfoSummary>>(new Map());
  const relayInfoFetchedAtRef = useRef<Map<string, number>>(new Map());
  const relayStatusCacheAdapter = useMemo(() => createNodexCacheAdapter(), []);

  const probeRelayInfo = useCallback(async (relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const inMemoryFetchedAt = relayInfoFetchedAtRef.current.get(normalizedRelayUrl);
    const hasFreshInMemoryInfo = typeof inMemoryFetchedAt === "number"
      && relayInfoRef.current.has(normalizedRelayUrl)
      && (Date.now() - inMemoryFetchedAt) <= RELAY_NIP11_CACHE_TTL_MS;

    if (hasFreshInMemoryInfo) {
      return;
    }

    const cachedRelayStatus = relayStatusCacheAdapter.getRelayStatus?.(normalizedRelayUrl);
    const resolvedCachedRelayStatus = isPromiseLike<NDKCacheRelayInfo | undefined>(cachedRelayStatus)
      ? await cachedRelayStatus
      : cachedRelayStatus;
    const cached = getFreshRelayInfoSummaryFromCache(resolvedCachedRelayStatus, {
      now: Date.now(),
      maxAgeMs: RELAY_NIP11_CACHE_TTL_MS,
    });
    if (cached) {
      relayInfoRef.current.set(normalizedRelayUrl, cached.summary);
      relayInfoFetchedAtRef.current.set(normalizedRelayUrl, cached.fetchedAt);
      updateRelayEntry(normalizedRelayUrl, (relay) => {
        const nextNip11 = {
          authRequired: cached.summary.authRequired,
          supportsNip42: cached.summary.supportsNip42,
          checkedAt: cached.fetchedAt,
        };
        if (
          relay.nip11?.authRequired === nextNip11.authRequired
          && relay.nip11?.supportsNip42 === nextNip11.supportsNip42
          && relay.nip11?.checkedAt === nextNip11.checkedAt
        ) {
          return relay;
        }
        return { ...relay, nip11: nextNip11 };
      });
      nostrDevLog("relay", "Relay NIP-11 info restored from cache", {
        relayUrl: normalizedRelayUrl,
        authRequired: cached.summary.authRequired,
        supportsNip42: cached.summary.supportsNip42,
      });
      return;
    }

    const info = await fetchRelayInfo(normalizedRelayUrl);
    if (!info) {
      nostrDevLog("relay", "Relay NIP-11 info unavailable", {
        relayUrl: normalizedRelayUrl,
      });
      return;
    }
    const checkedAt = Date.now();
    relayInfoRef.current.set(normalizedRelayUrl, info);
    relayInfoFetchedAtRef.current.set(normalizedRelayUrl, checkedAt);
    void relayStatusCacheAdapter.updateRelayStatus?.(normalizedRelayUrl, {
      nip11: {
        data: relayInfoSummaryToNip11Document(info),
        fetchedAt: checkedAt,
      },
    });
    updateRelayEntry(normalizedRelayUrl, (relay) => {
      const nextNip11 = {
        authRequired: info.authRequired,
        supportsNip42: info.supportsNip42,
        checkedAt,
      };
      if (
        relay.nip11?.authRequired === nextNip11.authRequired
        && relay.nip11?.supportsNip42 === nextNip11.supportsNip42
        && relay.nip11?.checkedAt === nextNip11.checkedAt
      ) {
        return relay;
      }
      return { ...relay, nip11: nextNip11 };
    });
    nostrDevLog("relay", "Relay NIP-11 info loaded", {
      relayUrl: normalizedRelayUrl,
      authRequired: info.authRequired,
      supportsNip42: info.supportsNip42,
    });
  }, [relayStatusCacheAdapter, updateRelayEntry]);

  // Hydrate per-relay NIP-11 info from cache synchronously at startup so the
  // initial relay-status snapshot can carry capability data before the first
  // probe completes. Async cache adapters are skipped (probeRelayInfo will
  // backfill).
  const hydrateStartupCache = useCallback((relayUrls: string[]) => {
    relayInfoFetchedAtRef.current.clear();
    relayUrls.forEach((relayUrl) => {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      const cachedRelayStatus = relayStatusCacheAdapter.getRelayStatus?.(normalizedRelayUrl);
      if (isPromiseLike<NDKCacheRelayInfo | undefined>(cachedRelayStatus)) {
        return;
      }
      const cached = getFreshRelayInfoSummaryFromCache(cachedRelayStatus, {
        now: Date.now(),
        maxAgeMs: RELAY_NIP11_CACHE_TTL_MS,
      });
      if (!cached) return;
      relayInfoRef.current.set(normalizedRelayUrl, cached.summary);
      relayInfoFetchedAtRef.current.set(normalizedRelayUrl, cached.fetchedAt);
      nostrDevLog("relay", "Relay NIP-11 info restored from startup cache", {
        relayUrl: normalizedRelayUrl,
        authRequired: cached.summary.authRequired,
        supportsNip42: cached.summary.supportsNip42,
      });
    });
  }, [relayStatusCacheAdapter]);

  const clearRelayInfo = useCallback((normalizedRelayUrl: string) => {
    relayInfoRef.current.delete(normalizedRelayUrl);
    relayInfoFetchedAtRef.current.delete(normalizedRelayUrl);
    void relayStatusCacheAdapter.updateRelayStatus?.(normalizedRelayUrl, {});
  }, [relayStatusCacheAdapter]);

  return {
    relayInfoRef,
    relayInfoFetchedAtRef,
    relayStatusCacheAdapter,
    probeRelayInfo,
    hydrateStartupCache,
    clearRelayInfo,
  };
}
