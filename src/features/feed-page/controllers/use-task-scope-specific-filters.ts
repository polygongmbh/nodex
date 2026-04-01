import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { mapPeopleSelection } from "@/domain/content/filter-state-utils";
import type { FilterSnapshot } from "@/domain/content/filter-snapshot";
import type { Channel, ChannelMatchMode, Person } from "@/types";

export const TASK_SCOPE_FILTER_RESTORE_TIMEOUT_MS = 5 * 60 * 1000;

interface UseTaskScopeSpecificFiltersOptions {
  focusedTaskId: string | null;
  currentFilterSnapshot: FilterSnapshot;
  setChannelFilterStates: Dispatch<SetStateAction<Map<string, Channel["filterState"]>>>;
  setChannelMatchMode: Dispatch<SetStateAction<ChannelMatchMode>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
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
  setChannelFilterStates,
  setChannelMatchMode,
  setPeople,
  restoreTimeoutMs = TASK_SCOPE_FILTER_RESTORE_TIMEOUT_MS,
  now = () => Date.now(),
}: UseTaskScopeSpecificFiltersOptions) {
  const previousFocusedTaskIdRef = useRef<string | null>(null);
  const suspendedSnapshotRef = useRef<{
    snapshot: FilterSnapshot;
    enteredScopedAtMs: number;
  } | null>(null);

  useEffect(() => {
    const previousFocusedTaskId = previousFocusedTaskIdRef.current;
    const enteringScopedTask = previousFocusedTaskId === null && focusedTaskId !== null;
    const leavingScopedTask = previousFocusedTaskId !== null && focusedTaskId === null;

    if (enteringScopedTask) {
      if (suspendedSnapshotRef.current === null) {
        suspendedSnapshotRef.current = {
          snapshot: currentFilterSnapshot,
          enteredScopedAtMs: now(),
        };
      }

      setChannelFilterStates((previous) => (previous.size === 0 ? previous : new Map()));
      setChannelMatchMode((previous) => (previous === "and" ? previous : "and"));
      setPeople((previous) => {
        const hasSelectedPeople = previous.some((person) => person.isSelected);
        return hasSelectedPeople ? mapPeopleSelection(previous, () => false) : previous;
      });
    }

    if (leavingScopedTask && suspendedSnapshotRef.current !== null) {
      const { snapshot, enteredScopedAtMs } = suspendedSnapshotRef.current;
      const hasCurrentChannelFilters = Object.keys(currentFilterSnapshot.channelStates).length > 0;
      const hasCurrentPeopleFilters = currentFilterSnapshot.selectedPeopleIds.length > 0;
      const shouldPreserveCurrentSelections = hasCurrentChannelFilters || hasCurrentPeopleFilters;
      const shouldRestore = now() - enteredScopedAtMs <= restoreTimeoutMs;

      if (!shouldPreserveCurrentSelections && shouldRestore) {
        setChannelFilterStates(restoreChannelFilterStates(snapshot));
        setChannelMatchMode(snapshot.channelMatchMode);
        setPeople((previous) =>
          mapPeopleSelection(previous, (person) => snapshot.selectedPeopleIds.includes(person.id))
        );
      }

      suspendedSnapshotRef.current = null;
    }

    previousFocusedTaskIdRef.current = focusedTaskId;
  }, [
    currentFilterSnapshot,
    focusedTaskId,
    now,
    restoreTimeoutMs,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
  ]);

  const discardTaskScopeFilterRestore = () => {
    suspendedSnapshotRef.current = null;
  };

  return {
    discardTaskScopeFilterRestore,
  };
}
