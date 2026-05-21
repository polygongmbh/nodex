import { useCallback, useMemo, useRef } from "react";
import type { NDKRelayInformation } from "@nostr-dev-kit/ndk";
import {
  createNodexCacheAdapter,
  loadCachedRelayNip11,
  saveCachedRelayNip11,
} from "@/infrastructure/cache/ndk-cache-adapter";
import { fetchRelayInfo } from "@/infrastructure/nostr/relay-info";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { NDKRelayStatus } from "./contracts";
import { buildNip11Status } from "./relay-status";

interface UseRelayNip11Args {
  updateRelayEntry: (
    normalizedRelayUrl: string,
    transform: (relay: NDKRelayStatus) => NDKRelayStatus
  ) => void;
}

export function useRelayNip11({ updateRelayEntry }: UseRelayNip11Args) {
  const relayDocumentRef = useRef<Map<string, NDKRelayInformation>>(new Map());
  const relayStatusCacheAdapter = useMemo(() => createNodexCacheAdapter(), []);

  const applyDocument = useCallback((normalizedRelayUrl: string, document: NDKRelayInformation) => {
    relayDocumentRef.current.set(normalizedRelayUrl, document);
    const nextNip11 = buildNip11Status(document);
    updateRelayEntry(normalizedRelayUrl, (relay) => {
      if (relay.nip11?.document === nextNip11.document) return relay;
      return { ...relay, nip11: nextNip11 };
    });
  }, [updateRelayEntry]);

  const probeRelayInfo = useCallback(async (relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (relayDocumentRef.current.has(normalizedRelayUrl)) return;

    const cached = loadCachedRelayNip11(normalizedRelayUrl);
    if (cached) {
      applyDocument(normalizedRelayUrl, cached);
      nostrDevLog("relay", "Relay NIP-11 info restored from cache", { relayUrl: normalizedRelayUrl });
      return;
    }

    const fetched = await fetchRelayInfo(normalizedRelayUrl);
    if (!fetched) {
      nostrDevLog("relay", "Relay NIP-11 info unavailable", { relayUrl: normalizedRelayUrl });
      return;
    }
    saveCachedRelayNip11(normalizedRelayUrl, fetched.document);
    applyDocument(normalizedRelayUrl, fetched.document);
    nostrDevLog("relay", "Relay NIP-11 info loaded", { relayUrl: normalizedRelayUrl });
  }, [applyDocument]);

  // Hydrate per-relay NIP-11 info from cache synchronously at startup so the
  // initial relay-status snapshot can carry capability data before the first
  // probe completes.
  const hydrateStartupCache = useCallback((relayUrls: string[]) => {
    relayUrls.forEach((relayUrl) => {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      const cached = loadCachedRelayNip11(normalizedRelayUrl);
      if (!cached) return;
      relayDocumentRef.current.set(normalizedRelayUrl, cached);
      nostrDevLog("relay", "Relay NIP-11 info restored from startup cache", { relayUrl: normalizedRelayUrl });
    });
  }, []);

  const clearRelayInfo = useCallback((normalizedRelayUrl: string) => {
    relayDocumentRef.current.delete(normalizedRelayUrl);
    void relayStatusCacheAdapter.updateRelayStatus?.(normalizedRelayUrl, {});
  }, [relayStatusCacheAdapter]);

  return {
    relayDocumentRef,
    relayStatusCacheAdapter,
    probeRelayInfo,
    hydrateStartupCache,
    clearRelayInfo,
  };
}
