import { useCallback, useEffect, useRef, useState } from "react";
import type { NDKEvent, NDKFilter, NDKRelay, NDKSubscription, NostrEvent } from "@nostr-dev-kit/ndk";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import type { NostrEventKind, NostrEventWithRelay } from "@/lib/nostr/types";
import { registerMemdiagStore } from "@/lib/memdiag";
import {
  flushBatchedNotifications,
  setNotificationBatching,
} from "@/lib/store-batch";

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

function getScheduling(): { isInputPending?: () => boolean } | undefined {
  return typeof navigator !== "undefined"
    ? (navigator as { scheduling?: { isInputPending?: () => boolean } }).scheduling
    : undefined;
}

function isInputPendingNow(): boolean {
  return getScheduling()?.isInputPending?.() ?? false;
}

function shouldYieldDrain(startMs: number): boolean {
  if (isInputPendingNow()) return true;
  if (typeof performance === "undefined") return false;
  return performance.now() - startMs > DRAIN_BUDGET_MS;
}

// Yield to the event loop via MessageChannel — ~0.1ms vs setTimeout(0)'s
// clamped ~4ms. Lets the browser handle paint / input between chunks while
// still resuming the drain as soon as possible.
let yieldChannel: MessageChannel | null = null;
let yieldCallback: (() => void) | null = null;

function yieldThenRun(fn: () => void): void {
  if (typeof MessageChannel === "undefined") {
    setTimeout(fn, 0);
    return;
  }
  if (yieldChannel === null) {
    yieldChannel = new MessageChannel();
    yieldChannel.port1.onmessage = () => {
      const cb = yieldCallback;
      yieldCallback = null;
      cb?.();
    };
  }
  yieldCallback = fn;
  yieldChannel.port2.postMessage(null);
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

function getRelayUrls(event: NDKEvent | NostrEvent, relayOverride?: NDKRelay | null): string[] {
  const ndkEvent = event as NDKEvent;
  return normalizeRelayUrlScope(
    [
      relayOverride?.url,
      ndkEvent.relay?.url,
      ...(ndkEvent.onRelays || []).map((relay) => relay?.url),
    ].filter((url): url is string => Boolean(url))
  );
}

// NDK's `event:dup` emits a raw NostrEvent when the duplicate came in via
// dispatchEvent (subManager → eventReceived), not a wrapped NDKEvent — so
// rawEvent() may not exist. Spread the raw fields when it doesn't.
function toIngestable(
  event: NDKEvent | NostrEvent,
  relayOverride?: NDKRelay | null,
): NostrEventWithRelay {
  const raw = typeof (event as NDKEvent).rawEvent === "function"
    ? (event as NDKEvent).rawEvent()
    : (event as NostrEvent);
  return {
    ...raw,
    id: raw.id ?? "",
    sig: raw.sig ?? "",
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
  // Forward refs — flushPending needs to re-arm via schedulePendingFlush
  // and call itself after the MessageChannel yield, but both depend on
  // flushPending's identity.
  const schedulePendingFlushRef = useRef<() => void>(() => {});
  const flushPendingRef = useRef<() => void>(() => {});
  const ingestedTotalRef = useRef(0);
  const ingestedByKindRef = useRef<Map<number, number>>(new Map());
  const tagsArraysSeenRef = useRef(0);
  const tagsCellsSeenRef = useRef(0);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const supported = typeof getScheduling()?.isInputPending === "function";
    console.debug("[hydration-perf] isInputPending supported:", supported);
  }, []);

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

    // Batching is enabled for the entire hydration window (see the
    // useEffect that wires setNotificationBatching to isConnected), not
    // toggled per chunk — every chunk renders the full Index tree
    // (~80–100 ms for ~500 posts), so flushing between chunks accumulated
    // to seconds of wall-clock during hydration even with the drain itself
    // being cheap. Holding batching across the hydration window keeps the
    // store snapshots frozen (version doesn't move; see posts-store)
    // until finalizeBootstrapScope releases them in a single flush.

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

    const moreInBatch = processed < batch.length;
    if (moreInBatch) {
      // Stitch the unprocessed tail back in front of anything that arrived
      // while we were running.
      const tail = batch.slice(processed);
      const arrivedDuringDrain = pendingEventsRef.current;
      pendingEventsRef.current = arrivedDuringDrain.length === 0
        ? tail
        : tail.concat(arrivedDuringDrain);
    }
    const moreEventsRemain = pendingEventsRef.current.length > 0;
    const inputPending = isInputPendingNow();

    const reason = !moreEventsRemain
      ? "done"
      : inputPending
        ? "input-pending"
        : "budget";
    if (import.meta.env.DEV && typeof performance !== "undefined") {
      const elapsed = performance.now() - start;
      console.debug(
        `[hydration-perf] drain chunk: processed=${processed} batchSize=${batch.length} pending=${pendingEventsRef.current.length} totalIngested=${ingestedTotalRef.current} ms=${elapsed.toFixed(1)} reason=${reason}`,
      );
      try {
        performance.measure("router-drain-chunk", { start, end: start + elapsed });
      } catch { /* performance.measure-with-options not supported */ }
    }

    if (moreEventsRemain && !inputPending) {
      // Budget yield with no input contending. Resume immediately via the
      // MessageChannel yield — much faster than the 64 ms debounced flush,
      // which is only needed to coalesce cross-microtask NDK event arrivals.
      yieldThenRun(() => flushPendingRef.current());
      return;
    }

    if (moreEventsRemain) {
      // Input is pending — re-arm via the debounced flush so the click
      // commits first; batching stays on, so the click sees the frozen
      // snapshot (cheap render) until finalize releases.
      schedulePendingFlushRef.current();
      return;
    }
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
  useEffect(() => {
    flushPendingRef.current = flushPending;
  }, [flushPending]);

  const pushEvent = useCallback((event: NDKEvent | NostrEvent, relayOverride?: NDKRelay | null) => {
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
    // Release the hydration-wide batch: flush every store at once so React
    // renders the full Index tree exactly once with the live data, then
    // disable batching so subsequent ingest updates fan out immediately.
    flushBatchedNotifications();
    setNotificationBatching(false);
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
    // Hold subscriber wake-ups across the whole hydration window so the
    // Index tree renders once with cached state and once again with the
    // full live data at finalize, instead of once per chunk in between.
    setNotificationBatching(true);
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
      pushEventRef.current(event, relay);
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
      // Drop the hydration-wide batch on teardown so the next mount starts
      // from a clean slate.
      setNotificationBatching(false);
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
