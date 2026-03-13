import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NDKEvent, NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk";
import {
  ALL_RELAYS_SCOPE_KEY,
  EMPTY_RELAY_SCOPE_KEY,
  loadCachedNostrEvents,
  saveCachedNostrEvents,
  type CachedNostrEvent,
} from "@/lib/nostr/event-cache";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { getReplaceableEventKey, isParameterizedReplaceableKind } from "@/lib/nostr/replaceable-events";

export const NOSTR_EVENTS_QUERY_KEY = ["nostr-events-cache"] as const;
const CACHE_BOOTSTRAP_MAX_AGE_MS = 8000;
const CACHE_PERSIST_DEBOUNCE_MS = 750;
const HYDRATION_FLUSH_BATCH_SIZE = 50;
const HYDRATION_FLUSH_DELAY_MS = 64;
const DEMO_RELAY_ID = "demo";

interface UseNostrEventCacheParams {
  isConnected: boolean;
  subscribedKinds: number[];
  activeRelayIds: Set<string>;
  availableRelayIds: string[];
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
}

interface UseNostrEventCacheResult {
  events: CachedNostrEvent[];
  feedScopeKey: string;
  hasLiveHydratedScope: boolean;
}

export function buildFeedScopeKey(activeRelayIds: Set<string>, availableRelayIds: string[]): string {
  const availableKeys = Array.from(
    new Set(
      availableRelayIds
        .map((value) => value.trim().toLowerCase())
        .filter((value) => Boolean(value) && value !== DEMO_RELAY_ID)
    )
  ).sort();
  if (availableKeys.length === 0) return EMPTY_RELAY_SCOPE_KEY;

  const keys = Array.from(
    new Set(
      Array.from(activeRelayIds)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => Boolean(value) && value !== DEMO_RELAY_ID)
    )
  ).sort();
  if (keys.length === 0) return ALL_RELAYS_SCOPE_KEY;
  return keys.join(",");
}

export function getNostrEventsQueryKey(feedScopeKey: string): readonly [...typeof NOSTR_EVENTS_QUERY_KEY, string] {
  return [...NOSTR_EVENTS_QUERY_KEY, feedScopeKey] as const;
}

function toCachedEvent(event: NDKEvent): CachedNostrEvent | null {
  if (!event.id) return null;
  const relayUrl = event.relay?.url?.trim().replace(/\/+$/, "");
  const relayUrls = relayUrl ? [relayUrl] : undefined;
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at || Math.floor(Date.now() / 1000),
    kind: event.kind,
    tags: event.tags,
    content: event.content || "",
    sig: event.sig || undefined,
    relayUrl,
    relayUrls,
  };
}

function getRelayUrls(event: CachedNostrEvent): string[] {
  const urls = [
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter((url) => Boolean(url));
  return Array.from(new Set(urls)).sort();
}

function upsertCachedEvent(
  previous: CachedNostrEvent[],
  incoming: CachedNostrEvent
): CachedNostrEvent[] {
  if (isParameterizedReplaceableKind(incoming.kind) && getReplaceableEventKey(incoming) === null) {
    return previous;
  }
  const previousWithSameId = previous.find((event) => event.id === incoming.id);
  const mergedRelayUrls = previousWithSameId
    ? Array.from(new Set([...getRelayUrls(previousWithSameId), ...getRelayUrls(incoming)])).sort()
    : getRelayUrls(incoming);
  const normalizedIncoming: CachedNostrEvent = {
    ...incoming,
    relayUrl: mergedRelayUrls[0],
    relayUrls: mergedRelayUrls.length > 0 ? mergedRelayUrls : undefined,
  };
  const incomingReplaceableKey = getReplaceableEventKey(normalizedIncoming);
  const withoutExisting = previous.filter((event) => {
    if (event.id === normalizedIncoming.id) return false;
    if (!incomingReplaceableKey) return true;
    return getReplaceableEventKey(event) !== incomingReplaceableKey;
  });
  return [normalizedIncoming, ...withoutExisting].sort((left, right) => right.created_at - left.created_at);
}

export function drainPendingCachedEvents(
  previous: CachedNostrEvent[],
  pending: CachedNostrEvent[],
  batchSize = HYDRATION_FLUSH_BATCH_SIZE
): {
  nextEvents: CachedNostrEvent[];
  remaining: CachedNostrEvent[];
  flushedCount: number;
} {
  if (pending.length === 0 || batchSize <= 0) {
    return {
      nextEvents: previous,
      remaining: pending,
      flushedCount: 0,
    };
  }

  const batch = pending.slice(0, batchSize);
  const nextEvents = batch.reduce(
    (events, event) => upsertCachedEvent(events, event),
    previous
  );

  return {
    nextEvents,
    remaining: pending.slice(batch.length),
    flushedCount: batch.length,
  };
}

export function useNostrEventCache({
  isConnected,
  subscribedKinds,
  activeRelayIds,
  availableRelayIds,
  subscribe,
}: UseNostrEventCacheParams): UseNostrEventCacheResult {
  const queryClient = useQueryClient();
  const [hasLiveHydratedScope, setHasLiveHydratedScope] = useState(false);
  const feedScopeKey = useMemo(
    () => buildFeedScopeKey(activeRelayIds, availableRelayIds),
    [activeRelayIds, availableRelayIds]
  );
  const queryKey = useMemo(() => getNostrEventsQueryKey(feedScopeKey), [feedScopeKey]);
  const hasFinalizedBootstrapRef = useRef(false);
  const hasMarkedLiveHydratedScopeRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const hydrationFlushTimerRef = useRef<number | null>(null);
  const pendingHydrationEventsRef = useRef<CachedNostrEvent[]>([]);

  const clearHydrationFlushTimer = useCallback(() => {
    if (hydrationFlushTimerRef.current === null || typeof window === "undefined") return;
    window.clearTimeout(hydrationFlushTimerRef.current);
    hydrationFlushTimerRef.current = null;
  }, []);

  const flushPendingEvents = useCallback((flushAll = false) => {
    clearHydrationFlushTimer();

    if (pendingHydrationEventsRef.current.length === 0) {
      return;
    }

    const pendingBeforeFlush = pendingHydrationEventsRef.current.length;
    const batchSize = flushAll ? pendingBeforeFlush : HYDRATION_FLUSH_BATCH_SIZE;

    queryClient.setQueryData<CachedNostrEvent[]>(
      queryKey,
      (previous = []) => {
        const drained = drainPendingCachedEvents(previous, pendingHydrationEventsRef.current, batchSize);
        pendingHydrationEventsRef.current = drained.remaining;
        return drained.nextEvents;
      }
    );

    const remaining = pendingHydrationEventsRef.current.length;
    nostrDevLog("hydrate", "Flushed cached Nostr events batch", {
      feedScopeKey,
      flushedCount: pendingBeforeFlush - remaining,
      remaining,
      flushAll,
    });

    if (remaining > 0 && typeof window !== "undefined") {
      hydrationFlushTimerRef.current = window.setTimeout(() => {
        flushPendingEvents(false);
      }, HYDRATION_FLUSH_DELAY_MS);
    }
  }, [clearHydrationFlushTimer, feedScopeKey, queryClient, queryKey]);

  const schedulePendingEventFlush = useCallback(() => {
    if (typeof window === "undefined") {
      flushPendingEvents(false);
      return;
    }
    if (hydrationFlushTimerRef.current !== null) return;
    hydrationFlushTimerRef.current = window.setTimeout(() => {
      flushPendingEvents(false);
    }, HYDRATION_FLUSH_DELAY_MS);
  }, [flushPendingEvents]);

  useEffect(() => {
    hasFinalizedBootstrapRef.current = false;
    hasMarkedLiveHydratedScopeRef.current = false;
    pendingHydrationEventsRef.current = [];
    clearHydrationFlushTimer();
    setHasLiveHydratedScope(false);
  }, [clearHydrationFlushTimer, feedScopeKey]);

  const { data: nostrEvents = [] } = useQuery({
    queryKey,
    queryFn: () => loadCachedNostrEvents(feedScopeKey),
    initialData: () => loadCachedNostrEvents(feedScopeKey),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const markLiveHydratedScope = useCallback(() => {
    if (hasMarkedLiveHydratedScopeRef.current) return;
    hasMarkedLiveHydratedScopeRef.current = true;
    setHasLiveHydratedScope(true);
    queryClient.setQueryData<CachedNostrEvent[]>(
      queryKey,
      (previous = []) => previous.filter((event) => getRelayUrls(event).length > 0)
    );
  }, [queryClient, queryKey]);

  const finalizeBootstrapScope = useCallback(() => {
    flushPendingEvents(true);
    if (hasFinalizedBootstrapRef.current) return;
    hasFinalizedBootstrapRef.current = true;
    markLiveHydratedScope();
  }, [flushPendingEvents, markLiveHydratedScope]);

  const pushEvent = useCallback((event: NDKEvent) => {
    const cachedEvent = toCachedEvent(event);
    if (!cachedEvent) return;
    markLiveHydratedScope();
    pendingHydrationEventsRef.current = [...pendingHydrationEventsRef.current, cachedEvent];
    schedulePendingEventFlush();
  }, [markLiveHydratedScope, schedulePendingEventFlush]);

  useEffect(() => {
    if (!isConnected) return;
    const timeoutId = window.setTimeout(() => {
      finalizeBootstrapScope();
    }, CACHE_BOOTSTRAP_MAX_AGE_MS);

    const subscription = subscribe(
      [{ kinds: subscribedKinds }],
      pushEvent,
      { closeOnEose: true }
    );
    subscription?.on("eose", finalizeBootstrapScope);
    subscription?.on("close", finalizeBootstrapScope);
    return () => {
      window.clearTimeout(timeoutId);
      flushPendingEvents(true);
      subscription?.stop();
    };
  }, [finalizeBootstrapScope, flushPendingEvents, isConnected, pushEvent, subscribe, subscribedKinds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      saveCachedNostrEvents(nostrEvents, feedScopeKey);
      return;
    }

    const flushPersist = () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushPendingEvents(true);
      const latestEvents = queryClient.getQueryData<CachedNostrEvent[]>(queryKey) || nostrEvents;
      saveCachedNostrEvents(latestEvents, feedScopeKey);
    };

    persistTimerRef.current = window.setTimeout(flushPersist, CACHE_PERSIST_DEBOUNCE_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      flushPersist();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushPersist();
    };
  }, [feedScopeKey, flushPendingEvents, nostrEvents, queryClient, queryKey]);

  return {
    events: nostrEvents,
    feedScopeKey,
    hasLiveHydratedScope,
  };
}
