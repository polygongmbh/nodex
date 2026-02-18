import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NDKEvent, NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk";
import {
  loadCachedNostrEvents,
  saveCachedNostrEvents,
  type CachedNostrEvent,
} from "@/lib/nostr-event-cache";

export const NOSTR_EVENTS_QUERY_KEY = ["nostr-events-cache"] as const;
const MAX_CACHED_EVENTS = 500;

interface UseNostrEventCacheParams {
  isConnected: boolean;
  subscribedKinds: number[];
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void
  ) => NDKSubscription | null;
}

function toCachedEvent(event: NDKEvent): CachedNostrEvent | null {
  if (!event.id) return null;
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at || Math.floor(Date.now() / 1000),
    kind: event.kind,
    tags: event.tags,
    content: event.content || "",
    sig: event.sig || undefined,
    relayUrl: event.relay?.url,
  };
}

function upsertCachedEvent(
  previous: CachedNostrEvent[],
  incoming: CachedNostrEvent
): CachedNostrEvent[] {
  const withoutExisting = previous.filter((event) => event.id !== incoming.id);
  return [incoming, ...withoutExisting]
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, MAX_CACHED_EVENTS);
}

export function useNostrEventCache({
  isConnected,
  subscribedKinds,
  subscribe,
}: UseNostrEventCacheParams): CachedNostrEvent[] {
  const queryClient = useQueryClient();
  const { data: nostrEvents = [] } = useQuery({
    queryKey: NOSTR_EVENTS_QUERY_KEY,
    queryFn: () => loadCachedNostrEvents(),
    initialData: loadCachedNostrEvents,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const pushEvent = useCallback((event: NDKEvent) => {
    const cachedEvent = toCachedEvent(event);
    if (!cachedEvent) return;
    queryClient.setQueryData<CachedNostrEvent[]>(
      NOSTR_EVENTS_QUERY_KEY,
      (previous = []) => upsertCachedEvent(previous, cachedEvent)
    );
  }, [queryClient]);

  useEffect(() => {
    if (!isConnected) return;

    const subscription = subscribe(
      [{ kinds: subscribedKinds, limit: 200 }],
      pushEvent
    );
    return () => subscription?.stop();
  }, [isConnected, pushEvent, subscribe, subscribedKinds]);

  useEffect(() => {
    saveCachedNostrEvents(nostrEvents);
  }, [nostrEvents]);

  return nostrEvents;
}
