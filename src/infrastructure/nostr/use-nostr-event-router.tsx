import { useCallback, useEffect, useRef, useState } from "react";
import type { NDKEvent, NDKFilter, NDKRelay, NDKSubscription } from "@nostr-dev-kit/ndk";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";

// Subscription manager for the NDK live feed. Validates each incoming event's
// relay attribution at the wire boundary and hands it off to a per-concern
// dispatcher; downstream stores (posts-store, reactions-registry, per-relay
// kind 0 cache, presence map) own their own state.
//
// Events arrive on separate microtasks from NDK, so naive per-event flushing
// causes one React render per backfill event. The router coalesces them
// behind a short debounce so the burst that follows EOSE / scope change
// turns into a small handful of synchronous flush batches — within each
// batch React batches the resulting state updates into one render.

// Fallback cap on how long to wait for a relay's stored-events backfill
// (EOSE/close) before flipping out of hydration. No local event cache is
// consulted here — the timeout governs the relay's server-side flush.
const BOOTSTRAP_EOSE_TIMEOUT_MS = 8000;
// 200 events fit easily inside a 16ms frame budget with the typed
// posts-store's O(1) folds, so we drain that many synchronously per tick
// and keep the inter-batch delay at the cross-microtask coalesce window.
// The previous release tier'd up to 500ms once pending exceeded a
// threshold; that was needed for the old O(N) per-batch upsert path and
// is now pure latency.
const HYDRATION_FLUSH_BATCH_SIZE = 200;
const HYDRATION_FLUSH_DELAY_MS = 64;
// EOSE is unreliable across many relays: a single slow relay drags the
// global EOSE out for seconds while the feed is already visually filled.
// Once we've drained at least one batch and stayed quiet for this long,
// declare bootstrap done — late-arriving events still ingest normally,
// they just no longer block the loading UI.
const HYDRATION_QUIESCENCE_MS = 1500;

export interface IngestableEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
  relayUrl?: string;
  relayUrls?: string[];
}

interface UseNostrEventRouterParams {
  isConnected: boolean;
  subscribedKinds: number[];
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  onEvent: (event: IngestableEvent) => void;
}

interface UseNostrEventRouterResult {
  hasLiveHydratedScope: boolean;
  /** True while the initial subscription backfill is in progress (pre-EOSE). */
  isHydrating: boolean;
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

function toIngestable(event: EventLike, relayOverride?: RelayLike): IngestableEvent | null {
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

export function useNostrEventRouter({
  isConnected,
  subscribedKinds,
  subscribe,
  onEvent,
}: UseNostrEventRouterParams): UseNostrEventRouterResult {
  const [hasLiveHydratedScope, setHasLiveHydratedScope] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);

  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const pendingEventsRef = useRef<IngestableEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const quiescenceTimerRef = useRef<number | null>(null);

  const clearQuiescenceTimer = useCallback(() => {
    if (quiescenceTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(quiescenceTimerRef.current);
      quiescenceTimerRef.current = null;
    }
  }, []);

  const scheduleQuiescenceFinalize = useCallback(() => {
    if (typeof window === "undefined") return;
    clearQuiescenceTimer();
    quiescenceTimerRef.current = window.setTimeout(() => {
      quiescenceTimerRef.current = null;
      // Only finalize if no events have arrived since this timer was armed
      // (pendingEventsRef is empty AND we're not already finalized).
      if (pendingEventsRef.current.length === 0) {
        finalizeBootstrapScopeRef.current();
      }
    }, HYDRATION_QUIESCENCE_MS);
  }, [clearQuiescenceTimer]);

  const flushPending = useCallback(() => {
    if (flushTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const pending = pendingEventsRef.current;
    if (pending.length === 0) return;
    const batchSize = Math.min(pending.length, HYDRATION_FLUSH_BATCH_SIZE);
    // Splice out the batch synchronously so the onEvent loop below — which
    // mutates downstream stores — completes within a single tick. React then
    // batches the resulting state updates into a single render.
    const batch = pending.splice(0, batchSize);
    for (const ingestable of batch) {
      onEventRef.current(ingestable);
    }
    if (pending.length > 0 && typeof window !== "undefined") {
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        flushPending();
      }, HYDRATION_FLUSH_DELAY_MS);
    } else {
      // Drained — start quiescence countdown. New events will reset it.
      scheduleQuiescenceFinalize();
    }
  }, [scheduleQuiescenceFinalize]);

  const schedulePendingFlush = useCallback(() => {
    if (typeof window === "undefined") {
      flushPending();
      return;
    }
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flushPending();
    }, HYDRATION_FLUSH_DELAY_MS);
  }, [flushPending]);

  const pushEvent = useCallback((event: EventLike, relayOverride?: RelayLike) => {
    const ingestable = toIngestable(event, relayOverride);
    if (!ingestable) return;
    pendingEventsRef.current.push(ingestable);
    // A new event arrived — cancel any pending quiescence-based finalize so
    // we wait for this burst to drain before re-arming.
    clearQuiescenceTimer();
    if (!hasLiveHydratedScope) setHasLiveHydratedScope(true);
    schedulePendingFlush();
  }, [hasLiveHydratedScope, schedulePendingFlush, clearQuiescenceTimer]);

  const finalizeBootstrapScope = useCallback(() => {
    clearQuiescenceTimer();
    // Drain any pending events synchronously so the post-EOSE state matches
    // the events the relay actually delivered.
    while (pendingEventsRef.current.length > 0) {
      flushPending();
    }
    setIsHydrating(false);
    setHasLiveHydratedScope(true);
  }, [flushPending, clearQuiescenceTimer]);

  const pushEventRef = useRef(pushEvent);
  const finalizeBootstrapScopeRef = useRef(finalizeBootstrapScope);
  const subscribeRef = useRef(subscribe);
  const subscribedKindsRef = useRef(subscribedKinds);
  useEffect(() => { pushEventRef.current = pushEvent; }, [pushEvent]);
  useEffect(() => { finalizeBootstrapScopeRef.current = finalizeBootstrapScope; }, [finalizeBootstrapScope]);
  useEffect(() => { subscribeRef.current = subscribe; }, [subscribe]);
  useEffect(() => { subscribedKindsRef.current = subscribedKinds; }, [subscribedKinds]);

  const subscriptionRef = useRef<NDKSubscription | null>(null);
  const bootstrapTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    if (subscriptionRef.current) return;
    setIsHydrating(true);
    bootstrapTimeoutRef.current = window.setTimeout(() => {
      finalizeBootstrapScopeRef.current();
    }, BOOTSTRAP_EOSE_TIMEOUT_MS);

    const subscription = subscribeRef.current(
      [{ kinds: subscribedKindsRef.current }],
      (event) => pushEventRef.current(event as EventLike),
      { closeOnEose: false }
    );
    subscriptionRef.current = subscription;
    subscription?.on("event:dup", (event, relay) => {
      pushEventRef.current(event as EventLike, relay);
    });
    subscription?.on("eose", () => finalizeBootstrapScopeRef.current());
    subscription?.on("close", () => finalizeBootstrapScopeRef.current());
  }, [isConnected]);

  useEffect(() => {
    return () => {
      if (bootstrapTimeoutRef.current !== null) {
        window.clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (quiescenceTimerRef.current !== null) {
        window.clearTimeout(quiescenceTimerRef.current);
        quiescenceTimerRef.current = null;
      }
      pendingEventsRef.current = [];
      setIsHydrating(false);
      subscriptionRef.current?.stop();
      subscriptionRef.current = null;
    };
  }, []);

  return {
    hasLiveHydratedScope,
    isHydrating,
  };
}
