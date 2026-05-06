import { startTransition, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

const INITIAL_VISIBLE_FEED_ENTRIES = 40;
const FEED_REVEAL_BATCH_SIZE = 30;

interface UseFeedHydrationWindowOptions {
  focusedTaskId: string | null;
  totalEntryCount: number;
  /** Opaque string that identifies the active filter scope. When it changes
   *  while no task is focused, the window resets to the initial entry count. */
  filterKey?: string;
}

interface UseFeedHydrationWindowResult {
  hasMoreEntries: boolean;
  visibleEntryCount: number;
  revealMoreEntries: (reason: "scroll" | "focus") => void;
  revealEntriesThroughIndex: (entryIndex: number) => void;
}

export function useFeedHydrationWindow({
  focusedTaskId,
  totalEntryCount,
  filterKey,
}: UseFeedHydrationWindowOptions): UseFeedHydrationWindowResult {
  // focusedTaskId acts as the scope key: reveal transitions check it so a
  // startTransition queued in one scope cannot apply after a scope change.
  const [state, setState] = useState({ focusedTaskId, count: INITIAL_VISIBLE_FEED_ENTRIES });
  const savedParentCountRef = useRef<number | null>(null);
  const prevFocusedTaskIdRef = useRef<string | null>(null);
  const prevFilterKeyRef = useRef<string | undefined>(filterKey);
  // Always-current raw count so the scope-entry save doesn't capture a stale value.
  const stateCountRef = useRef(state.count);
  stateCountRef.current = state.count;

  const visibleEntryCount =
    state.focusedTaskId === focusedTaskId ? state.count : INITIAL_VISIBLE_FEED_ENTRIES;
  const hasMoreEntries = totalEntryCount > visibleEntryCount;

  useLayoutEffect(() => {
    const prevId = prevFocusedTaskIdRef.current;
    prevFocusedTaskIdRef.current = focusedTaskId;
    const prevKey = prevFilterKeyRef.current;
    prevFilterKeyRef.current = filterKey;

    if (focusedTaskId !== null) {
      if (prevId === null) {
        savedParentCountRef.current = stateCountRef.current;
      }
      setState({ focusedTaskId, count: INITIAL_VISIBLE_FEED_ENTRIES });
    } else if (prevId !== null && savedParentCountRef.current !== null) {
      setState({ focusedTaskId: null, count: savedParentCountRef.current });
    } else if (prevId !== null) {
      setState({ focusedTaskId: null, count: INITIAL_VISIBLE_FEED_ENTRIES });
    } else if (prevKey !== undefined && prevKey !== filterKey) {
      // Filter changed at top level. If savedParentCountRef is still set, we're in the
      // second render of the scope-exit filter-restore sequence — skip the reset and just
      // clear the ref. Otherwise this is a real user-initiated channel switch.
      if (savedParentCountRef.current === null) {
        setState({ focusedTaskId: null, count: INITIAL_VISIBLE_FEED_ENTRIES });
      }
      savedParentCountRef.current = null;
    }
  }, [focusedTaskId, filterKey]);

  const revealMoreEntries = useCallback((reason: "scroll" | "focus") => {
    if (totalEntryCount <= visibleEntryCount) return;
    const next = Math.min(totalEntryCount, visibleEntryCount + FEED_REVEAL_BATCH_SIZE);
    nostrDevLog("feed", "Revealed incremental feed batch", { reason, visibleEntryCount: next, totalEntryCount });
    startTransition(() => setState(prev => {
      if (prev.focusedTaskId !== focusedTaskId) return prev;
      return next > prev.count ? { ...prev, count: next } : prev;
    }));
  }, [focusedTaskId, totalEntryCount, visibleEntryCount]);

  const revealEntriesThroughIndex = useCallback((entryIndex: number) => {
    if (entryIndex < visibleEntryCount || entryIndex < 0) return;
    startTransition(() => setState(prev => {
      if (prev.focusedTaskId !== focusedTaskId) return prev;
      const next = Math.min(totalEntryCount, entryIndex + 1 + FEED_REVEAL_BATCH_SIZE);
      return next > prev.count ? { ...prev, count: next } : prev;
    }));
  }, [focusedTaskId, totalEntryCount, visibleEntryCount]);

  return useMemo(() => ({
    hasMoreEntries,
    visibleEntryCount,
    revealMoreEntries,
    revealEntriesThroughIndex,
  }), [hasMoreEntries, revealEntriesThroughIndex, revealMoreEntries, visibleEntryCount]);
}
