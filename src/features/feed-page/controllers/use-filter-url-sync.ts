import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { Channel } from "@/types";
import type { Person } from "@/types/person";

const RELAY_PARAM = "r";
const CHANNEL_INCLUDE_PARAM = "ch";
const CHANNEL_EXCLUDE_PARAM = "ex";
const PEOPLE_PARAM = "p";

interface RelayFilterSnapshot {
  channelStates: Map<string, Channel["filterState"]>;
  selectedPeopleIds: Set<string>;
}

/**
 * Parses filter state from URL search params.
 */
export function parseFilterSearchParams(searchParams: URLSearchParams): {
  relayIds: Set<string> | null;
  channelFilters: Map<string, Channel["filterState"]> | null;
  selectedPersonIds: Set<string> | null;
} {
  const rRaw = searchParams.get(RELAY_PARAM);
  const chRaw = searchParams.get(CHANNEL_INCLUDE_PARAM);
  const exRaw = searchParams.get(CHANNEL_EXCLUDE_PARAM);
  const pRaw = searchParams.get(PEOPLE_PARAM);

  let relayIds: Set<string> | null = null;
  if (rRaw !== null) {
    relayIds = new Set(rRaw.split(",").map((s) => s.trim()).filter(Boolean));
  }

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

  return { relayIds, channelFilters, selectedPersonIds };
}

/**
 * Builds URL search params from filter state, returning only non-empty params.
 */
export function buildFilterSearchParams(
  activeRelayIds: Set<string>,
  channelFilterStates: Map<string, Channel["filterState"]>,
  people: Person[]
): URLSearchParams {
  const params = new URLSearchParams();

  const relayArray = [...activeRelayIds].sort();
  if (relayArray.length > 0) params.set(RELAY_PARAM, relayArray.join(","));

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

  merged.delete(RELAY_PARAM);
  merged.delete(CHANNEL_INCLUDE_PARAM);
  merged.delete(CHANNEL_EXCLUDE_PARAM);
  merged.delete(PEOPLE_PARAM);

  const r = nextFilterSearchParams.get(RELAY_PARAM);
  const ch = nextFilterSearchParams.get(CHANNEL_INCLUDE_PARAM);
  const ex = nextFilterSearchParams.get(CHANNEL_EXCLUDE_PARAM);
  const p = nextFilterSearchParams.get(PEOPLE_PARAM);

  if (r) merged.set(RELAY_PARAM, r);
  if (ch) merged.set(CHANNEL_INCLUDE_PARAM, ch);
  if (ex) merged.set(CHANNEL_EXCLUDE_PARAM, ex);
  if (p) merged.set(PEOPLE_PARAM, p);

  return merged;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

interface UseFilterUrlSyncOptions {
  activeRelayIds: Set<string>;
  setActiveRelayIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  channelFilterStates: Map<string, Channel["filterState"]>;
  people: Person[];
  setChannelFilterStates: React.Dispatch<React.SetStateAction<Map<string, Channel["filterState"]>>>;
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
}

/**
 * Bidirectional sync between relay/channel/people filter state and URL search params.
 *
 * Also manages per-relay session memory: when switching exclusively from one single-relay
 * selection to another (complete switch, no intersection), saves and restores the
 * channel/people selection for each relay. The save/restore is skipped when channels or
 * people change simultaneously with the relay (e.g. a saved-filter apply), so saved filters
 * own their state without interference.
 *
 * On mount: reads URL params and applies them to state (URL wins over localStorage).
 * On state change: updates URL params (replaces, doesn't push history).
 */
export function useFilterUrlSync({
  activeRelayIds,
  setActiveRelayIds,
  channelFilterStates,
  people,
  setChannelFilterStates,
  setPeople,
}: UseFilterUrlSyncOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const didHydrateFromUrlRef = useRef(false);
  const pendingUrlSelectedPersonIdsRef = useRef<Set<string> | null>(null);

  // Per-relay session memory: channel/people snapshot per relay ID (only saved for single-relay selections)
  const perRelayMemoryRef = useRef(new Map<string, RelayFilterSnapshot>());

  // Previous-value refs for change detection in the per-relay memory effect
  const prevRelayIdsRef = useRef<Set<string> | null>(null);
  const prevChannelStatesRef = useRef(channelFilterStates);
  const prevPeopleRef = useRef(people);

  // Hydrate state from URL on initial mount (URL wins)
  useEffect(() => {
    if (didHydrateFromUrlRef.current) return;
    didHydrateFromUrlRef.current = true;

    const { relayIds, channelFilters, selectedPersonIds } = parseFilterSearchParams(searchParams);

    if (relayIds !== null) {
      setActiveRelayIds(relayIds);
    }

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

  // Per-relay session memory: save and restore channel/people selection on relay switches.
  useEffect(() => {
    const prevRelayIds = prevRelayIdsRef.current;

    // Skip on first render — initialise refs and bail
    if (prevRelayIds === null) {
      prevRelayIdsRef.current = activeRelayIds;
      prevChannelStatesRef.current = channelFilterStates;
      prevPeopleRef.current = people;
      return;
    }

    const prevChannelStates = prevChannelStatesRef.current;
    const prevPeople = prevPeopleRef.current;

    const isRelayChange = !setsEqual(prevRelayIds, activeRelayIds);
    const isChannelChange = channelFilterStates !== prevChannelStates;
    const isPeopleChange = people !== prevPeople;

    if (isRelayChange) {
      // Always save the departing single-relay's state before this render's values take hold
      if (prevRelayIds.size === 1) {
        const [oldRelayId] = prevRelayIds;
        perRelayMemoryRef.current.set(oldRelayId, {
          channelStates: prevChannelStates,
          selectedPeopleIds: new Set(prevPeople.filter((p) => p.isSelected).map((p) => p.id)),
        });
      }

      // Restore only on a pure relay switch (channels/people unchanged in the same batch).
      // If channels or people also changed, something else (e.g. a saved-filter apply) drove
      // the update and should own the resulting state.
      if (!isChannelChange && !isPeopleChange) {
        const isCompleteSwitch = [...activeRelayIds].every((id) => !prevRelayIds.has(id));
        if (isCompleteSwitch && activeRelayIds.size === 1) {
          const [newRelayId] = activeRelayIds;
          const saved = perRelayMemoryRef.current.get(newRelayId);
          if (saved) {
            setChannelFilterStates(saved.channelStates);
            const savedIds = saved.selectedPeopleIds;
            setPeople((prev) =>
              prev.map((person) => ({ ...person, isSelected: savedIds.has(person.id) }))
            );
          }
        }
      }
    }

    prevRelayIdsRef.current = activeRelayIds;
    prevChannelStatesRef.current = channelFilterStates;
    prevPeopleRef.current = people;
  }, [activeRelayIds, channelFilterStates, people, setChannelFilterStates, setPeople]);

  // Sync state → URL
  useEffect(() => {
    if (!didHydrateFromUrlRef.current) return;

    const newFilterParams = buildFilterSearchParams(activeRelayIds, channelFilterStates, people);
    const mergedSearchParams = mergeFilterSearchParams(searchParams, newFilterParams);

    if (mergedSearchParams.toString() === searchParams.toString()) {
      return;
    }

    setSearchParams(mergedSearchParams, { replace: true });
  }, [activeRelayIds, channelFilterStates, people, searchParams, setSearchParams]);
}
