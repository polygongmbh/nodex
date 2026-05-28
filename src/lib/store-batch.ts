// Shared subscriber-notification batching for the in-memory stores
// (posts-store, seen-pubkeys-store, reactions-registry, etc.).
//
// During a heavy event-router drain, each store would otherwise wake its
// React subscribers on every mutation — for a 5000-event hydration burst
// that's thousands of synchronous re-renders interleaved with the drain
// loop. With batching enabled, stores still bump their version counters
// (so any concurrent read sees fresh state) but defer the subscriber
// fan-out until the router flushes — typically once per chunk if input
// is contending, or once at the end of the drain otherwise.
//
// Stores opt in by registering a flusher and consulting isBatchingNotifications()
// inside their notify path. Default off — single-event ingests and store
// mutations outside the drain notify immediately as before.

let batchingEnabled = false;
const flushers = new Set<() => void>();

export function registerStoreFlusher(flush: () => void): () => void {
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
  for (const flush of flushers) flush();
}
