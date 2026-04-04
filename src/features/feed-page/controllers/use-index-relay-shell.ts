import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Relay } from "@/types";
import type { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
import {
  ensureRelayProtocol,
  isRelayUrl,
  normalizeRelayUrl,
} from "@/infrastructure/nostr/relay-url";
import { NOSTR_EVENTS_QUERY_KEY } from "@/infrastructure/nostr/use-nostr-event-cache";
import {
  removeCachedNostrEventsByRelayUrl,
  removeRelayUrlFromCachedEvents,
  type CachedNostrEvent,
} from "@/infrastructure/nostr/event-cache";

export interface UseIndexRelayShellOptions {
  ndkRelays: NDKRelayStatus[];
  relays: Relay[];
  effectiveActiveRelayIds: Set<string>;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  setActiveRelayIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  removeCachedRelayProfile: (relayUrl: string) => void;
}

export interface UseIndexRelayShellResult {
  nostrRelays: Array<{
    url: string;
    status: NDKRelayStatus["status"];
    latency?: number;
    nip11?: NDKRelayStatus["nip11"];
  }>;
  relaysWithActiveState: Relay[];
  selectedRelayUrls: string[];
  handleAddRelay: (url: string) => void;
  handleRemoveRelay: (url: string) => void;
}

export function deriveSelectedRelayUrls(relays: Relay[], effectiveActiveRelayIds: Set<string>): string[] {
  return relays
    .filter((relay) => relay.url && effectiveActiveRelayIds.has(relay.id))
    .map((relay) => relay.url as string);
}

export function normalizeRelayAddUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (trimmed.includes("://") && !lower.startsWith("ws://") && !lower.startsWith("wss://")) {
    return null;
  }

  const withProtocol = ensureRelayProtocol(trimmed, "wss");
  if (!withProtocol || !isRelayUrl(withProtocol)) return null;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
  } catch {
    return null;
  }

  return normalizeRelayUrl(withProtocol);
}

export function useIndexRelayShell({
  ndkRelays,
  relays,
  effectiveActiveRelayIds,
  addRelay,
  removeRelay,
  setActiveRelayIds,
  removeCachedRelayProfile,
}: UseIndexRelayShellOptions): UseIndexRelayShellResult {
  const queryClient = useQueryClient();

  const nostrRelays = useMemo(() => {
    return ndkRelays.map((r) => ({
      url: r.url,
      status: r.status,
      latency: r.latency,
      nip11: r.nip11,
    }));
  }, [ndkRelays]);

  const relaysWithActiveState: Relay[] = useMemo(() => {
    return relays.map((r) => ({
      ...r,
      isActive: effectiveActiveRelayIds.has(r.id),
    }));
  }, [relays, effectiveActiveRelayIds]);
  const selectedRelayUrls = useMemo(
    () => deriveSelectedRelayUrls(relays, effectiveActiveRelayIds),
    [effectiveActiveRelayIds, relays]
  );

  const handleAddRelay = useCallback(
    (url: string) => {
      const normalizedRelayUrl = normalizeRelayAddUrl(url);
      if (!normalizedRelayUrl) return;

      addRelay(normalizedRelayUrl);
      const relayId = getRelayIdFromUrl(normalizedRelayUrl);
      if (!relayId) return;
      setActiveRelayIds((previous) => {
        if (previous.has(relayId)) return previous;
        const next = new Set(previous);
        next.add(relayId);
        return next;
      });
    },
    [addRelay, setActiveRelayIds]
  );

  const handleRemoveRelay = useCallback(
    (url: string) => {
      const normalizedRelayUrl = url.trim().replace(/\/+$/, "");
      if (!normalizedRelayUrl) return;

      queryClient.setQueriesData<CachedNostrEvent[]>(
        { queryKey: NOSTR_EVENTS_QUERY_KEY },
        (previous) => removeRelayUrlFromCachedEvents(previous || [], normalizedRelayUrl)
      );
      removeCachedNostrEventsByRelayUrl(normalizedRelayUrl);
      removeCachedRelayProfile(normalizedRelayUrl);

      const relayId = getRelayIdFromUrl(normalizedRelayUrl);
      if (relayId) {
        setActiveRelayIds((previous) => {
          if (!previous.has(relayId)) return previous;
          const next = new Set(previous);
          next.delete(relayId);
          return next;
        });
      }

      removeRelay(normalizedRelayUrl);
    },
    [queryClient, removeCachedRelayProfile, removeRelay, setActiveRelayIds]
  );

  return {
    nostrRelays,
    relaysWithActiveState,
    selectedRelayUrls,
    handleAddRelay,
    handleRemoveRelay,
  };
}
