import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NDKEvent, NDKFilter, NDKRelay, NDKSubscription } from "@nostr-dev-kit/ndk";
import {
  ALL_RELAYS_SCOPE_KEY,
  EMPTY_RELAY_SCOPE_KEY,
  NOSTR_EVENT_CACHE_RETENTION_SECONDS,
  loadCachedNostrEventsForBootstrap,
  loadCachedNostrEvents,
  saveCachedNostrEvents,
  type CachedNostrEvent,
} from "@/infrastructure/nostr/event-cache";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { getReplaceableEventKey, isParameterizedReplaceableKind } from "@/infrastructure/nostr/replaceable-events";

export const NOSTR_EVENTS_QUERY_KEY = ["nostr-events-cache"] as const;
const CACHE_BOOTSTRAP_MAX_AGE_MS = 8000;
const CACHE_PERSIST_DEBOUNCE_MS = 750;
const HYDRATION_FLUSH_BATCH_SIZE = 50;
const HYDRATION_FLUSH_DELAY_MS = 64;
// When the pending queue is large the relay is in a bulk-backfill burst.
// Use a longer delay so events accumulate into fewer, larger flushes.
const HYDRATION_BURST_THRESHOLD = 200;
const HYDRATION_BURST_DELAY_MS = 500;
const LIVE_SUBSCRIPTION_OVERLAP_SECONDS = 60;
const DEMO_RELAY_ID = "demo";

/** Returns the flush debounce delay appropriate for the current pending queue depth. */
export function getFlushDelayMs(pendingCount: number): number {
  return pendingCount > HYDRATION_BURST_THRESHOLD ? HYDRATION_BURST_DELAY_MS : HYDRATION_FLUSH_DELAY_MS;
}

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
  /** True while the initial subscription backfill is in progress (pre-EOSE). */
  isHydrating: boolean;
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

export function buildLiveSubscriptionFilters(
  subscribedKinds: number[],
  cachedEvents: CachedNostrEvent[],
  nowSeconds = Math.floor(Date.now() / 1000)
): NDKFilter[] {
  const latestCreatedAt = cachedEvents.reduce((latest, event) => {
    return event.created_at > latest ? event.created_at : latest;
  }, 0);
  const fallbackSince = Math.max(0, nowSeconds - NOSTR_EVENT_CACHE_RETENTION_SECONDS);
  const since = latestCreatedAt > 0
    ? Math.max(0, latestCreatedAt - LIVE_SUBSCRIPTION_OVERLAP_SECONDS)
    : fallbackSince;

  return [{
    kinds: subscribedKinds,
    since,
  }];
}

type RelayLike = Pick<NDKRelay, "url"> | null | undefined;

type EventLike = Pick<NDKEvent, "id" | "pubkey" | "created_at" | "kind" | "tags" | "content" | "sig"> & {
  relay?: RelayLike;
  onRelays?: RelayLike[];
};

function getRelayUrlsFromEvent(event: EventLike, relayOverride?: RelayLike): string[] {
  return normalizeRelayUrlScope(
    [
      relayOverride?.url,
      event.relay?.url,
      ...(event.onRelays || []).map((relay) => relay?.url),
    ].filter((url): url is string => Boolean(url))
  );
}

function toCachedEvent(event: EventLike, relayOverride?: RelayLike): CachedNostrEvent | null {
  if (!event.id) return null;
  const relayUrls = getRelayUrlsFromEvent(event, relayOverride);
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at || Math.floor(Date.now() / 1000),
    kind: event.kind,
    tags: event.tags,
    content: event.content || "",
    sig: event.sig || undefined,
    relayUrl: relayUrls[0],
    relayUrls: relayUrls.length > 0 ? relayUrls : undefined,
  };
}

function getRelayUrls(event: CachedNostrEvent): string[] {
  return normalizeRelayUrlScope([
    ...(event.relayUrls || []),
    ...(event.relayUrl ? [event.relayUrl] : []),
  ]);
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
  const [isHydrating, setIsHydrating] = useState(false);
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
  const latestPersistedEventsRef = useRef<CachedNostrEvent[]>([]);

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
    if (!hasFinalizedBootstrapRef.current) {
      nostrDevLog("hydrate", "Flushed cached Nostr events batch", {
        feedScopeKey,
        flushedCount: pendingBeforeFlush - remaining,
        remaining,
        flushAll,
      });
    }

    if (remaining > 0 && typeof window !== "undefined") {
      const delay = getFlushDelayMs(remaining);
      hydrationFlushTimerRef.current = window.setTimeout(() => {
        flushPendingEvents(false);
      }, delay);
    }
  }, [clearHydrationFlushTimer, feedScopeKey, queryClient, queryKey]);

  const schedulePendingEventFlush = useCallback(() => {
    if (typeof window === "undefined") {
      flushPendingEvents(false);
      return;
    }
    if (hydrationFlushTimerRef.current !== null) return;
    const delay = getFlushDelayMs(pendingHydrationEventsRef.current.length);
    hydrationFlushTimerRef.current = window.setTimeout(() => {
      flushPendingEvents(false);
    }, delay);
  }, [flushPendingEvents]);

  useEffect(() => {
    hasFinalizedBootstrapRef.current = false;
    hasMarkedLiveHydratedScopeRef.current = false;
    pendingHydrationEventsRef.current = [];
    clearHydrationFlushTimer();
    setHasLiveHydratedScope(false);
    setIsHydrating(false);
  }, [clearHydrationFlushTimer, feedScopeKey]);

  const { data: nostrEvents = [] } = useQuery({
    queryKey,
    queryFn: () => loadCachedNostrEventsForBootstrap(feedScopeKey),
    initialData: () => loadCachedNostrEventsForBootstrap(feedScopeKey),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    latestPersistedEventsRef.current = nostrEvents;
  }, [nostrEvents]);

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
    setIsHydrating(false);
    if (hasFinalizedBootstrapRef.current) return;
    hasFinalizedBootstrapRef.current = true;
    markLiveHydratedScope();
  }, [flushPendingEvents, markLiveHydratedScope]);

  const pushEvent = useCallback((event: EventLike, relayOverride?: RelayLike) => {
    const cachedEvent = toCachedEvent(event, relayOverride);
    if (!cachedEvent) return;
    markLiveHydratedScope();
    pendingHydrationEventsRef.current = [...pendingHydrationEventsRef.current, cachedEvent];
    schedulePendingEventFlush();
  }, [markLiveHydratedScope, schedulePendingEventFlush]);

  useEffect(() => {
    if (!isConnected) return;
    setIsHydrating(true);
    const timeoutId = window.setTimeout(() => {
      finalizeBootstrapScope();
    }, CACHE_BOOTSTRAP_MAX_AGE_MS);
    const liveSubscriptionFilters = buildLiveSubscriptionFilters(subscribedKinds, nostrEvents);

    const subscription = subscribe(
      liveSubscriptionFilters,
      pushEvent,
      { closeOnEose: false }
    );
    subscription?.on("event:dup", (event, relay) => {
      pushEvent(event as EventLike, relay);
    });
    subscription?.on("eose", finalizeBootstrapScope);
    subscription?.on("close", finalizeBootstrapScope);
    return () => {
      window.clearTimeout(timeoutId);
      flushPendingEvents(true);
      setIsHydrating(false);
      subscription?.stop();
    };
  }, [finalizeBootstrapScope, flushPendingEvents, isConnected, nostrEvents, pushEvent, subscribe, subscribedKinds]);

  const flushPersist = useCallback(() => {
    if (typeof window !== "undefined" && persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    flushPendingEvents(true);
    const latestEvents =
      queryClient.getQueryData<CachedNostrEvent[]>(queryKey) || latestPersistedEventsRef.current;
    saveCachedNostrEvents(latestEvents, feedScopeKey);
  }, [feedScopeKey, flushPendingEvents, queryClient, queryKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      saveCachedNostrEvents(nostrEvents, feedScopeKey);
      return;
    }

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(flushPersist, CACHE_PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimerRef.current === null) return;
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    };
  }, [feedScopeKey, flushPersist, nostrEvents]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      flushPersist();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushPersist();
    };
  }, [flushPersist]);

  return {
    events: nostrEvents,
    feedScopeKey,
    hasLiveHydratedScope,
    isHydrating,
  };
}
