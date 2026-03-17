import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Relay } from "@/types";
import type { NDKRelayStatus } from "@/lib/nostr/ndk-context";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
import { NOSTR_EVENTS_QUERY_KEY } from "@/infrastructure/nostr/use-nostr-event-cache";
import {
  removeCachedNostrEventsByRelayUrl,
  removeRelayUrlFromCachedEvents,
  type CachedNostrEvent,
} from "@/lib/nostr/event-cache";

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
  handleAddRelay: (url: string) => void;
  handleRemoveRelay: (url: string) => void;
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

  const handleAddRelay = useCallback(
    (url: string) => {
      addRelay(url);
      const relayId = getRelayIdFromUrl(url);
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
    handleAddRelay,
    handleRemoveRelay,
  };
}
