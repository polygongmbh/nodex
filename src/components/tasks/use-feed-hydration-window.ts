import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

const INITIAL_VISIBLE_FEED_ENTRIES = 40;
const FEED_REVEAL_BATCH_SIZE = 30;

interface UseFeedHydrationWindowOptions {
  disclosureKey: string;
  focusedTaskId: string | null;
  totalEntryCount: number;
}

interface UseFeedHydrationWindowResult {
  hasMoreEntries: boolean;
  visibleEntryCount: number;
  revealMoreEntries: (reason: "scroll" | "focus") => void;
  revealEntriesThroughIndex: (entryIndex: number) => void;
}

export function useFeedHydrationWindow({
  disclosureKey,
  focusedTaskId,
  totalEntryCount,
}: UseFeedHydrationWindowOptions): UseFeedHydrationWindowResult {
  const keyCountHistoryRef = useRef<Map<string, number>>(new Map());
  // Saved outside the LRU so it cannot be evicted by subtask navigation.
  const savedParentCountRef = useRef<number | null>(null);

  const [windowState, setWindowState] = useState(() => ({
    key: disclosureKey,
    visibleEntryCount: INITIAL_VISIBLE_FEED_ENTRIES,
  }));

  const visibleEntryCount =
    windowState.key === disclosureKey
      ? windowState.visibleEntryCount
      : focusedTaskId === null && savedParentCountRef.current !== null
        ? savedParentCountRef.current
        : (keyCountHistoryRef.current.get(disclosureKey) ?? INITIAL_VISIBLE_FEED_ENTRIES);
  const hasMoreEntries = totalEntryCount > visibleEntryCount;

  useEffect(() => {
    if (windowState.key === disclosureKey) {
      // Settled back at parent level — safe to release the saved count.
      if (focusedTaskId === null) savedParentCountRef.current = null;
      return;
    }
    if (focusedTaskId !== null && savedParentCountRef.current === null) {
      // Entering a subtask: protect the parent count outside the LRU.
      savedParentCountRef.current = windowState.visibleEntryCount;
    }
    keyCountHistoryRef.current.set(windowState.key, windowState.visibleEntryCount);
    if (keyCountHistoryRef.current.size > 5) {
      keyCountHistoryRef.current.delete(keyCountHistoryRef.current.keys().next().value!);
    }
    const restoredCount =
      focusedTaskId === null && savedParentCountRef.current !== null
        ? savedParentCountRef.current
        : (keyCountHistoryRef.current.get(disclosureKey) ?? INITIAL_VISIBLE_FEED_ENTRIES);
    startTransition(() => {
      setWindowState({ key: disclosureKey, visibleEntryCount: restoredCount });
    });
  // windowState is a dep so that when visibleEntryCount grows the saved count
  // for the outgoing key stays current (the early return guards excess work).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disclosureKey, focusedTaskId, windowState]);

  const updateVisibleCount = useCallback(
    (nextVisibleCount: number, reason: "scroll" | "focus") => {
      startTransition(() => {
        setWindowState((previous) => {
          const previousVisibleCount =
            previous.key === disclosureKey
              ? previous.visibleEntryCount
              : INITIAL_VISIBLE_FEED_ENTRIES;
          const boundedNextVisibleCount = Math.min(totalEntryCount, nextVisibleCount);
          if (boundedNextVisibleCount <= previousVisibleCount) {
            return { key: disclosureKey, visibleEntryCount: previousVisibleCount };
          }
          nostrDevLog("feed", "Revealed incremental feed batch", {
            reason,
            visibleEntryCount: boundedNextVisibleCount,
            totalEntryCount,
          });
          return { key: disclosureKey, visibleEntryCount: boundedNextVisibleCount };
        });
      });
    },
    [disclosureKey, totalEntryCount]
  );

  const revealMoreEntries = useCallback((reason: "scroll" | "focus") => {
    if (!hasMoreEntries) return;
    updateVisibleCount(visibleEntryCount + FEED_REVEAL_BATCH_SIZE, reason);
  }, [hasMoreEntries, updateVisibleCount, visibleEntryCount]);

  const revealEntriesThroughIndex = useCallback((entryIndex: number) => {
    if (entryIndex < visibleEntryCount || entryIndex < 0) return;
    updateVisibleCount(entryIndex + 1 + FEED_REVEAL_BATCH_SIZE, "focus");
  }, [updateVisibleCount, visibleEntryCount]);

  return useMemo(() => ({
    hasMoreEntries,
    visibleEntryCount,
    revealMoreEntries,
    revealEntriesThroughIndex,
  }), [hasMoreEntries, revealEntriesThroughIndex, revealMoreEntries, visibleEntryCount]);
}
