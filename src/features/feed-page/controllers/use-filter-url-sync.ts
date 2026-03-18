import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Channel, Person } from "@/types";

const CHANNEL_INCLUDE_PARAM = "ch";
const CHANNEL_EXCLUDE_PARAM = "ex";
const PEOPLE_PARAM = "p";

/**
 * Parses filter state from URL search params.
 */
export function parseFilterSearchParams(searchParams: URLSearchParams): {
  channelFilters: Map<string, Channel["filterState"]> | null;
  selectedPersonIds: Set<string> | null;
} {
  const chRaw = searchParams.get(CHANNEL_INCLUDE_PARAM);
  const exRaw = searchParams.get(CHANNEL_EXCLUDE_PARAM);
  const pRaw = searchParams.get(PEOPLE_PARAM);

  let channelFilters: Map<string, Channel["filterState"]> | null = null;
  if (chRaw !== null || exRaw !== null) {
    channelFilters = new Map();
    if (chRaw) {
      for (const id of chRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
        channelFilters.set(id, "included");
      }
    }
    if (exRaw) {
      for (const id of exRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
        channelFilters.set(id, "excluded");
      }
    }
  }

  let selectedPersonIds: Set<string> | null = null;
  if (pRaw !== null) {
    selectedPersonIds = new Set(
      pRaw.split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  return { channelFilters, selectedPersonIds };
}

/**
 * Builds URL search params from filter state, returning only non-empty params.
 */
export function buildFilterSearchParams(
  channelFilterStates: Map<string, Channel["filterState"]>,
  people: Person[]
): URLSearchParams {
  const params = new URLSearchParams();

  const included: string[] = [];
  const excluded: string[] = [];
  channelFilterStates.forEach((state, id) => {
    if (state === "included") included.push(id);
    else if (state === "excluded") excluded.push(id);
  });

  if (included.length > 0) params.set(CHANNEL_INCLUDE_PARAM, included.sort().join(","));
  if (excluded.length > 0) params.set(CHANNEL_EXCLUDE_PARAM, excluded.sort().join(","));

  const selectedPeople = people
    .filter((p) => p.isSelected)
    .map((p) => p.id);
  if (selectedPeople.length > 0) params.set(PEOPLE_PARAM, selectedPeople.sort().join(","));

  return params;
}

export function mergeFilterSearchParams(
  currentSearchParams: URLSearchParams,
  nextFilterSearchParams: URLSearchParams
): URLSearchParams {
  const merged = new URLSearchParams(currentSearchParams);

  merged.delete(CHANNEL_INCLUDE_PARAM);
  merged.delete(CHANNEL_EXCLUDE_PARAM);
  merged.delete(PEOPLE_PARAM);

  const ch = nextFilterSearchParams.get(CHANNEL_INCLUDE_PARAM);
  const ex = nextFilterSearchParams.get(CHANNEL_EXCLUDE_PARAM);
  const p = nextFilterSearchParams.get(PEOPLE_PARAM);

  if (ch) merged.set(CHANNEL_INCLUDE_PARAM, ch);
  if (ex) merged.set(CHANNEL_EXCLUDE_PARAM, ex);
  if (p) merged.set(PEOPLE_PARAM, p);

  return merged;
}

interface UseFilterUrlSyncOptions {
  channelFilterStates: Map<string, Channel["filterState"]>;
  people: Person[];
  setChannelFilterStates: React.Dispatch<React.SetStateAction<Map<string, Channel["filterState"]>>>;
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
}

/**
 * Bidirectional sync between channel/people filter state and URL search params.
 *
 * On mount: reads URL params and applies them to state (URL wins).
 * On state change: updates URL params (replaces, doesn't push history).
 */
export function useFilterUrlSync({
  channelFilterStates,
  people,
  setChannelFilterStates,
  setPeople,
}: UseFilterUrlSyncOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const didHydrateFromUrlRef = useRef(false);
  const pendingUrlSelectedPersonIdsRef = useRef<Set<string> | null>(null);

  // Hydrate state from URL on initial mount
  useEffect(() => {
    if (didHydrateFromUrlRef.current) return;
    didHydrateFromUrlRef.current = true;

    const { channelFilters, selectedPersonIds } = parseFilterSearchParams(searchParams);

    if (channelFilters !== null) {
      setChannelFilterStates(channelFilters);
    }

    if (selectedPersonIds !== null && selectedPersonIds.size > 0) {
      pendingUrlSelectedPersonIdsRef.current = new Set(selectedPersonIds);
      setPeople((prev) =>
        prev.map((person) => ({
          ...person,
          isSelected: selectedPersonIds.has(person.id),
        }))
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply URL-selected people to profiles that load after initial mount.
  useEffect(() => {
    const pendingIds = pendingUrlSelectedPersonIdsRef.current;
    if (!pendingIds || pendingIds.size === 0) return;

    const matchedIds = new Set(
      people
        .map((person) => person.id)
        .filter((id) => pendingIds.has(id))
    );

    if (matchedIds.size === 0) return;

    setPeople((prev) => {
      let changed = false;
      const next = prev.map((person) => {
        if (!matchedIds.has(person.id)) return person;
        if (person.isSelected) return person;
        changed = true;
        return { ...person, isSelected: true };
      });
      return changed ? next : prev;
    });

    const remainingIds = new Set(pendingIds);
    matchedIds.forEach((id) => remainingIds.delete(id));
    pendingUrlSelectedPersonIdsRef.current = remainingIds.size > 0 ? remainingIds : null;
  }, [people, setPeople]);

  // Sync state → URL (debounced to avoid thrashing during rapid changes)
  useEffect(() => {
    if (!didHydrateFromUrlRef.current) return;

    const newFilterParams = buildFilterSearchParams(channelFilterStates, people);
    const mergedSearchParams = mergeFilterSearchParams(searchParams, newFilterParams);

    if (mergedSearchParams.toString() === searchParams.toString()) {
      return;
    }

    setSearchParams(mergedSearchParams, { replace: true });
  }, [channelFilterStates, people, searchParams, setSearchParams]);
}
