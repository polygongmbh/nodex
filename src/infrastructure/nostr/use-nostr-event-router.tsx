import { useCallback, useEffect, useRef, useState } from "react";
import type { NDKEvent, NDKFilter, NDKRelay, NDKSubscription } from "@nostr-dev-kit/ndk";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import type { NostrEventKind, NostrEventWithRelay } from "@/lib/nostr/types";
import { registerMemdiagStore } from "@/lib/memdiag";

// Subscription manager for the NDK live feed. Validates each incoming event's
// relay attribution at the wire boundary and hands it off to a per-concern
// dispatcher; downstream stores (posts-store, reactions-registry, per-relay
// kind 0 cache, presence map) own their own state.
//
// Events arrive on separate microtasks from NDK, so naive per-event flushing
// causes one React render per backfill event. The router coalesces them
// behind a short debounce so a quiet burst becomes one synchronous drain —
// a single React commit covers however many events landed since the last tick.
//
// On heavy bursts the drain itself is the main-thread blocker (the React
// render that follows can't run until the loop ends). To keep input responsive
// during hydration the drain checks `navigator.scheduling.isInputPending()`
// every 32 events and bails out the moment the browser reports queued user
// input — the unprocessed tail re-arms via the existing debounced flush.
// Idle bursts still drain in one pass; only bursts contending with input
// pay the extra renders.

// Fallback cap on how long to wait for a relay's stored-events backfill
// (EOSE/close) before flipping out of hydration. No local event cache is
// consulted here — the timeout governs the relay's server-side flush.
const BOOTSTRAP_EOSE_TIMEOUT_MS = 8000;
const HYDRATION_FLUSH_DELAY_MS = 64;
// Wall-clock fallback when `navigator.scheduling.isInputPending` isn't
// available — bail out of the drain after roughly two frames so the
// next macrotask gets a chance to handle whatever queued up.
const DRAIN_BUDGET_MS = 32;
// Power-of-two so the check collapses to a cheap bitmask.
const YIELD_CHECK_INTERVAL = 32;

function shouldYieldDrain(startMs: number): boolean {
  const scheduling = typeof navigator !== "undefined"
    ? (navigator as { scheduling?: { isInputPending?: () => boolean } }).scheduling
    : undefined;
  if (scheduling?.isInputPending?.()) return true;
  if (typeof performance === "undefined") return false;
  return performance.now() - startMs > DRAIN_BUDGET_MS;
}
// EOSE is unreliable across many relays: a single slow relay drags the
// global EOSE out for seconds while the feed is already visually filled.
// Once we've drained at least one batch and stayed quiet for this long,
// declare bootstrap done — late-arriving events still ingest normally,
// they just no longer block the loading UI.
const HYDRATION_QUIESCENCE_MS = 1500;

interface UseNostrEventRouterParams {
  isConnected: boolean;
  subscribedKinds: number[];
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  onEvent: (event: NostrEventWithRelay) => void;
}

interface UseNostrEventRouterResult {
  hasLiveHydratedScope: boolean;
  /** True while the initial subscription backfill is in progress (pre-EOSE). */
  isHydrating: boolean;
}

function getRelayUrls(event: NDKEvent, relayOverride?: NDKRelay | null): string[] {
  return normalizeRelayUrlScope(
    [
      relayOverride?.url,
      event.relay?.url,
      ...(event.onRelays || []).map((relay) => relay?.url),
    ].filter((url): url is string => Boolean(url))
  );
}

function toIngestable(event: NDKEvent, relayOverride?: NDKRelay | null): NostrEventWithRelay {
  return {
    ...event.rawEvent(),
    kind: event.kind as NostrEventKind,
    relayUrls: getRelayUrls(event, relayOverride),
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

  const pendingEventsRef = useRef<NostrEventWithRelay[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const quiescenceTimerRef = useRef<number | null>(null);
  // Forward ref — flushPending needs to re-arm via schedulePendingFlush, but
  // schedulePendingFlush is defined after it and depends on it.
  const schedulePendingFlushRef = useRef<() => void>(() => {});
  const ingestedTotalRef = useRef(0);
  const ingestedByKindRef = useRef<Map<number, number>>(new Map());
  const tagsArraysSeenRef = useRef(0);
  const tagsCellsSeenRef = useRef(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    registerMemdiagStore("event-router", () => {
      const byKind: Record<string, number> = {};
      for (const [kind, count] of ingestedByKindRef.current) {
        byKind[`k${kind}`] = count;
      }
      return {
        size: pendingEventsRef.current.length,
        extras: {
          eventsIngestedTotal: ingestedTotalRef.current,
          tagsArraysSeen: tagsArraysSeenRef.current,
          tagsCellsSeen: tagsCellsSeenRef.current,
          ...byKind,
        },
      };
    });
  }, []);

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
    // Swap the array out so events arriving during the loop (e.g. NDK
    // callbacks triggered by store mutations) accumulate into a fresh queue.
    const batch = pendingEventsRef.current;
    if (batch.length === 0) return;
    pendingEventsRef.current = [];

    const start = typeof performance !== "undefined" ? performance.now() : 0;
    const callOnEvent = onEventRef.current;
    let processed = 0;
    while (processed < batch.length) {
      callOnEvent(batch[processed]);
      processed += 1;
      if ((processed & (YIELD_CHECK_INTERVAL - 1)) === 0 && shouldYieldDrain(start)) {
        break;
      }
    }

    if (import.meta.env.DEV) {
      ingestedTotalRef.current += processed;
      const byKind = ingestedByKindRef.current;
      for (let i = 0; i < processed; i += 1) {
        const ingestable = batch[i];
        const kind = ingestable.kind as number;
        byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
        const tags = ingestable.tags;
        if (Array.isArray(tags)) {
          tagsArraysSeenRef.current += tags.length;
          for (const tag of tags) {
            if (Array.isArray(tag)) tagsCellsSeenRef.current += tag.length;
          }
        }
      }
    }

    if (processed < batch.length) {
      // Yielded mid-drain. Stitch the unprocessed tail in front of anything
      // that arrived while we were running, then re-arm the debounced flush
      // so the next macrotask handles it after input gets a turn.
      const tail = batch.slice(processed);
      const arrivedDuringDrain = pendingEventsRef.current;
      pendingEventsRef.current = arrivedDuringDrain.length === 0
        ? tail
        : tail.concat(arrivedDuringDrain);
      schedulePendingFlushRef.current();
      return;
    }
    // Drained — start quiescence countdown. New events will reset it.
    scheduleQuiescenceFinalize();
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
  useEffect(() => {
    schedulePendingFlushRef.current = schedulePendingFlush;
  }, [schedulePendingFlush]);

  const pushEvent = useCallback((event: NDKEvent, relayOverride?: NDKRelay | null) => {
    pendingEventsRef.current.push(toIngestable(event, relayOverride));
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
      (event) => pushEventRef.current(event),
      { closeOnEose: false }
    );
    subscriptionRef.current = subscription;
    subscription?.on("event:dup", (event, relay) => {
      // event:dup is typed (NDKEvent | NDK's NostrEvent) but NDK only ever
      // emits NDKEvent instances; the union is overly defensive.
      pushEventRef.current(event as NDKEvent, relay);
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
