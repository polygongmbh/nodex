// Shared subscriber-notification batching for the in-memory stores
// (posts-store, reactions-registry, etc.).
//
// During a heavy event-router drain, each store would otherwise wake its
// React subscribers on every mutation — for a 5000-event hydration burst
// that's thousands of synchronous re-renders interleaved with the drain
// loop. With batching enabled, stores still bump their version counters
// (so any concurrent read sees fresh state) but defer the subscriber
// fan-out until the router flushes — typically once per chunk if input
// is contending, or once at the end of the drain otherwise.
//
// The drain-flush also runs inside React.startTransition so the resulting
// commits are scheduled at transition priority instead of urgent. React 19
// gives urgent useSyncExternalStore wake-ups strict precedence over
// transitions — and React Router 7 routes its navigations through
// startTransition — so without this, a steady stream of urgent hydration
// commits starves the pending route change and the click "doesn't take
// effect" until quiescence. By marking the consumer side as transitional
// too, navigation regains parity and the new view renders promptly.
//
// Stores opt in by registering a flusher and consulting isBatchingNotifications()
// inside their notify path. Default off — single-event ingests and store
// mutations outside the drain notify immediately at urgent priority.
//
// Two halves of cache lifecycle live by the same policy across the codebase:
//   1. Writes to durable storage (localStorage) are caller-scheduled and fire
//      only on tab-hide / pagehide / unload. See `posts-cache.ts` (driven
//      from `useCachedPosts`) and `Kind0Cache` (driven from the window
//      listeners on `defaultKind0Cache`). Per-event setTimeout debounces are
//      a footgun during hydration — they compete with the router drain for
//      main-thread time and JSON.stringify huge buckets while the user is
//      trying to click.
//   2. Reactive subscriber wake-ups (React re-renders) are batched through
//      this module while the router drain is in flight; outside a drain
//      they fan out immediately at urgent priority.
// New caches should follow the same pattern.

import { startTransition } from "react";

let batchingEnabled = false;
// Flushers return true when they actually had pending notifications to fan
// out. Used purely for instrumentation; semantics are unchanged.
const flushers = new Set<() => boolean>();

export function registerStoreFlusher(flush: () => boolean): () => void {
  flushers.add(flush);
  return () => { flushers.delete(flush); };
}

export function isBatchingNotifications(): boolean {
  return batchingEnabled;
}

export function setNotificationBatching(enabled: boolean): void {
  batchingEnabled = enabled;
}

export function flushBatchedNotifications(): void {
  const start = import.meta.env.DEV && typeof performance !== "undefined"
    ? performance.now()
    : 0;
  let dirty = 0;
  startTransition(() => {
    for (const flush of flushers) {
      if (flush()) dirty += 1;
    }
  });
  if (import.meta.env.DEV && typeof performance !== "undefined") {
    const elapsed = performance.now() - start;
    console.debug(`[hydration-perf] flushBatchedNotifications: dirty=${dirty}/${flushers.size} ms=${elapsed.toFixed(1)}`);
  }
}
