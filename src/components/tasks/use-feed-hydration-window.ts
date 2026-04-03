import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

const INITIAL_VISIBLE_FEED_ENTRIES = 40;
const FEED_REVEAL_BATCH_SIZE = 30;

interface UseFeedHydrationWindowOptions {
  disclosureKey: string;
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
  totalEntryCount,
}: UseFeedHydrationWindowOptions): UseFeedHydrationWindowResult {
  const [windowState, setWindowState] = useState(() => ({
    key: disclosureKey,
    visibleEntryCount: INITIAL_VISIBLE_FEED_ENTRIES,
  }));

  const visibleEntryCount =
    windowState.key === disclosureKey
      ? windowState.visibleEntryCount
      : INITIAL_VISIBLE_FEED_ENTRIES;
  const hasMoreEntries = totalEntryCount > visibleEntryCount;

  useEffect(() => {
    startTransition(() => {
      setWindowState({
        key: disclosureKey,
        visibleEntryCount: INITIAL_VISIBLE_FEED_ENTRIES,
      });
    });
  }, [disclosureKey]);

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
            return {
              key: disclosureKey,
              visibleEntryCount: previousVisibleCount,
            };
          }
          nostrDevLog("feed", "Revealed incremental feed batch", {
            reason,
            visibleEntryCount: boundedNextVisibleCount,
            totalEntryCount,
          });
          return {
            key: disclosureKey,
            visibleEntryCount: boundedNextVisibleCount,
          };
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
