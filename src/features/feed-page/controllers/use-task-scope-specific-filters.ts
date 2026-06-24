import { useLayoutEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FilterSnapshot } from "@/domain/content/filter-snapshot";
import type { Channel, ChannelMatchMode } from "@/types";

export const TASK_SCOPE_FILTER_RESTORE_TIMEOUT_MS = 5 * 60 * 1000;

const DEFAULT_NOW = () => Date.now();

interface UseTaskScopeSpecificFiltersOptions {
  focusedTaskId: string | null;
  currentFilterSnapshot: FilterSnapshot;
  shouldRestoreSnapshot?: (snapshot: FilterSnapshot) => boolean;
  setChannelFilterStates: Dispatch<SetStateAction<Map<string, Channel["filterState"]>>>;
  setChannelMatchMode: Dispatch<SetStateAction<ChannelMatchMode>>;
  setSelectedPubkeys: Dispatch<SetStateAction<Set<string>>>;
  /** Called when entering a scoped task to capture the current scroll position. */
  onCaptureScrollTop?: () => number | undefined;
  /** Called when leaving a scoped task, only if filters are being restored. */
  onRestoreScrollTop?: (scrollTop: number) => void;
  restoreTimeoutMs?: number;
  now?: () => number;
}

function restoreChannelFilterStates(snapshot: FilterSnapshot): Map<string, Channel["filterState"]> {
  return new Map(
    Object.entries(snapshot.channelStates).map(([channelId, filterState]) => [channelId, filterState])
  );
}

export function useTaskScopeSpecificFilters({
  focusedTaskId,
  currentFilterSnapshot,
  shouldRestoreSnapshot = () => true,
  setChannelFilterStates,
  setChannelMatchMode,
  setSelectedPubkeys,
  onCaptureScrollTop,
  onRestoreScrollTop,
  restoreTimeoutMs = TASK_SCOPE_FILTER_RESTORE_TIMEOUT_MS,
  now = DEFAULT_NOW,
}: UseTaskScopeSpecificFiltersOptions) {
  const previousFocusedTaskIdRef = useRef<string | null>(null);
  const suspendedSnapshotRef = useRef<{
    snapshot: FilterSnapshot;
    enteredScopedAtMs: number;
    scrollTop?: number;
  } | null>(null);

  useLayoutEffect(() => {
    const previousFocusedTaskId = previousFocusedTaskIdRef.current;
    const enteringScopedTask = previousFocusedTaskId === null && focusedTaskId !== null;
    const leavingScopedTask = previousFocusedTaskId !== null && focusedTaskId === null;

    if (enteringScopedTask) {
      if (suspendedSnapshotRef.current === null) {
        suspendedSnapshotRef.current = {
          snapshot: currentFilterSnapshot,
          enteredScopedAtMs: now(),
          scrollTop: onCaptureScrollTop?.(),
        };
      }

      setChannelFilterStates((previous) => (previous.size === 0 ? previous : new Map()));
      setChannelMatchMode((previous) => (previous === "and" ? previous : "and"));
      setSelectedPubkeys((previous) => (previous.size === 0 ? previous : new Set()));
    }

    if (leavingScopedTask && suspendedSnapshotRef.current !== null) {
      const { snapshot, enteredScopedAtMs, scrollTop } = suspendedSnapshotRef.current;
      const hasCurrentChannelFilters = Object.keys(currentFilterSnapshot.channelStates).length > 0;
      const hasCurrentPeopleFilters = currentFilterSnapshot.selectedPeopleIds.length > 0;
      const shouldPreserveCurrentSelections = hasCurrentChannelFilters || hasCurrentPeopleFilters;
      const shouldRestore = now() - enteredScopedAtMs <= restoreTimeoutMs;
      const shouldRestoreSelections = shouldRestoreSnapshot(snapshot);

      if (!shouldPreserveCurrentSelections && shouldRestore && shouldRestoreSelections) {
        setChannelFilterStates(restoreChannelFilterStates(snapshot));
        setChannelMatchMode(snapshot.channelMatchMode);
        setSelectedPubkeys(new Set(snapshot.selectedPeopleIds));
        if (scrollTop !== undefined) {
          onRestoreScrollTop?.(scrollTop);
        }
      }

      suspendedSnapshotRef.current = null;
    }

    previousFocusedTaskIdRef.current = focusedTaskId;
  }, [
    currentFilterSnapshot,
    focusedTaskId,
    now,
    onCaptureScrollTop,
    onRestoreScrollTop,
    restoreTimeoutMs,
    setChannelFilterStates,
    setChannelMatchMode,
    setSelectedPubkeys,
    shouldRestoreSnapshot,
  ]);

  const discardTaskScopeFilterRestore = () => {
    suspendedSnapshotRef.current = null;
  };

  return {
    discardTaskScopeFilterRestore,
  };
}
