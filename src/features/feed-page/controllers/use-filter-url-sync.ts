import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import type { Channel } from "@/types";

const RELAY_PARAM = "r";
const CHANNEL_INCLUDE_PARAM = "ch";
const CHANNEL_EXCLUDE_PARAM = "ex";
const PEOPLE_PARAM = "p";
const SEARCH_PARAM = "q";

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
  selectedPubkeys: Set<string>
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

  if (selectedPubkeys.size > 0) params.set(PEOPLE_PARAM, [...selectedPubkeys].sort().join(","));

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
  selectedPubkeys: Set<string>;
  setChannelFilterStates: React.Dispatch<React.SetStateAction<Map<string, Channel["filterState"]>>>;
  setSelectedPubkeys: (next: Set<string>) => void;
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
  selectedPubkeys,
  setChannelFilterStates,
  setSelectedPubkeys,
}: UseFilterUrlSyncOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const didHydrateFromUrlRef = useRef(false);

  // Per-relay session memory: channel/people snapshot per relay ID (only saved for single-relay selections)
  const perRelayMemoryRef = useRef(new Map<string, RelayFilterSnapshot>());

  // Previous-value refs for change detection in the per-relay memory effect
  const prevRelayIdsRef = useRef<Set<string> | null>(null);
  const prevChannelStatesRef = useRef(channelFilterStates);
  const prevSelectedRef = useRef(selectedPubkeys);

  // Hydrate state from URL on initial mount (URL wins). Selection is keyed by
  // pubkey now, so it applies immediately — no need to wait for the matching
  // kind-0 profiles to load (the old pending-ids backfill effect is gone).
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
      setSelectedPubkeys(new Set(selectedPersonIds));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-relay session memory: save and restore channel/people selection on relay switches.
  useEffect(() => {
    const prevRelayIds = prevRelayIdsRef.current;

    // Skip on first render — initialise refs and bail
    if (prevRelayIds === null) {
      prevRelayIdsRef.current = activeRelayIds;
      prevChannelStatesRef.current = channelFilterStates;
      prevSelectedRef.current = selectedPubkeys;
      return;
    }

    const prevChannelStates = prevChannelStatesRef.current;
    const prevSelected = prevSelectedRef.current;

    const isRelayChange = !setsEqual(prevRelayIds, activeRelayIds);
    const isChannelChange = channelFilterStates !== prevChannelStates;
    const isSelectionChange = selectedPubkeys !== prevSelected;

    if (isRelayChange) {
      // Always save the departing single-relay's state before this render's values take hold
      if (prevRelayIds.size === 1) {
        const [oldRelayId] = prevRelayIds;
        perRelayMemoryRef.current.set(oldRelayId, {
          channelStates: prevChannelStates,
          selectedPeopleIds: new Set(prevSelected),
        });
      }

      // Restore only on a pure relay switch (channels/people unchanged in the same batch).
      // If channels or people also changed, something else (e.g. a saved-filter apply) drove
      // the update and should own the resulting state.
      if (!isChannelChange && !isSelectionChange) {
        const isCompleteSwitch = [...activeRelayIds].every((id) => !prevRelayIds.has(id));
        if (isCompleteSwitch && activeRelayIds.size === 1) {
          const [newRelayId] = activeRelayIds;
          const saved = perRelayMemoryRef.current.get(newRelayId);
          if (saved) {
            setChannelFilterStates(saved.channelStates);
            setSelectedPubkeys(new Set(saved.selectedPeopleIds));
          }
        }
      }
    }

    prevRelayIdsRef.current = activeRelayIds;
    prevChannelStatesRef.current = channelFilterStates;
    prevSelectedRef.current = selectedPubkeys;
  }, [activeRelayIds, channelFilterStates, selectedPubkeys, setChannelFilterStates, setSelectedPubkeys]);

  // Sync state → URL
  useEffect(() => {
    if (!didHydrateFromUrlRef.current) return;

    const newFilterParams = buildFilterSearchParams(activeRelayIds, channelFilterStates, selectedPubkeys);
    const mergedSearchParams = mergeFilterSearchParams(searchParams, newFilterParams);

    if (mergedSearchParams.toString() === searchParams.toString()) {
      return;
    }

    setSearchParams(mergedSearchParams, { replace: true });
  }, [activeRelayIds, channelFilterStates, selectedPubkeys, searchParams, setSearchParams]);

  // searchQuery ↔ ?q=
  // URL → store on external URL changes (back/forward, focus-clear strip,
  // fresh load with ?q= in the address bar). Store → URL is debounced so
  // typing isn't a per-keystroke router-wide navigate.
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const urlQ = searchParams.get(SEARCH_PARAM) ?? "";
  useEffect(() => {
    if (useFilterStore.getState().searchQuery !== urlQ) {
      useFilterStore.getState().setSearchQuery(urlQ);
    }
  }, [urlQ]);
  useEffect(() => {
    if (searchQuery === urlQ) return;
    const id = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchQuery) next.set(SEARCH_PARAM, searchQuery);
          else next.delete(SEARCH_PARAM);
          return next;
        },
        { replace: true }
      );
    }, 200);
    return () => clearTimeout(id);
  }, [searchQuery, urlQ, setSearchParams]);
}
