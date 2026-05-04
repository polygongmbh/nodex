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
  // Captured on scope entry; never cleared so it survives intermediate exit renders.
  const savedParentCountRef = useRef<number | null>(null);
  const prevFocusedTaskIdRef = useRef<string | null>(null);

  const [windowState, setWindowState] = useState(() => ({
    key: disclosureKey,
    visibleEntryCount: INITIAL_VISIBLE_FEED_ENTRIES,
  }));

  const visibleEntryCount =
    windowState.key === disclosureKey
      ? windowState.visibleEntryCount
      : focusedTaskId === null && savedParentCountRef.current !== null
        ? savedParentCountRef.current
        : INITIAL_VISIBLE_FEED_ENTRIES;
  const hasMoreEntries = totalEntryCount > visibleEntryCount;

  useEffect(() => {
    const prevId = prevFocusedTaskIdRef.current;
    prevFocusedTaskIdRef.current = focusedTaskId;

    if (windowState.key === disclosureKey) return;

    if (prevId === null && focusedTaskId !== null) {
      // Entering a subtask from parent level: capture the current parent count.
      // Overwriting is intentional so a subsequent entry always saves the freshest value.
      savedParentCountRef.current = windowState.visibleEntryCount;
    }

    startTransition(() => {
      setWindowState({
        key: disclosureKey,
        visibleEntryCount:
          focusedTaskId === null && savedParentCountRef.current !== null
            ? savedParentCountRef.current
            : INITIAL_VISIBLE_FEED_ENTRIES,
      });
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
