import { useMemo } from "react";
import type { Post } from "@/types";
import type { SelectablePerson } from "@/types/person";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";

function normalizePersonId(id: string): string {
  return id.trim().toLowerCase();
}

export interface UsePinnedSidebarPeopleOptions {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  people: SelectablePerson[];
  allTasks: Post[];
}

export interface UsePinnedSidebarPeopleResult {
  pinnedPersonIds: string[];
  // Sorted with pinned pubkeys first (in pin order), then the rest by their
  // input ordering. Pinned membership is exposed via pinnedPersonIds, not
  // attached as a per-row field.
  peopleWithState: SelectablePerson[];
  handlePersonPin: (id: string) => void;
  handlePersonUnpin: (id: string) => void;
}

export function usePinnedSidebarPeople({
  userPubkey,
  effectiveActiveRelayIds,
  people,
  allTasks,
}: UsePinnedSidebarPeopleOptions): UsePinnedSidebarPeopleResult {
  const personRelayIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const task of allTasks) {
      const authorId = normalizePersonId(task.author?.pubkey || "");
      if (!authorId) continue;
      let relays = map.get(authorId);
      if (!relays) {
        relays = new Set();
        map.set(authorId, relays);
      }
      for (const relayId of task.relays) relays.add(relayId);
    }
    return map;
  }, [allTasks]);

  const {
    pinnedIds: pinnedPersonIds,
    pinAcrossRelays: handlePersonPin,
    unpinAcrossRelays: handlePersonUnpin,
  } = usePinnedSidebarEntityState({
    userPubkey,
    effectiveActiveRelayIds,
    entityRelayIds: personRelayIds,
    namespace: "pinned-people",
    idKey: "personId" as const,
    normalizeEntityId: normalizePersonId,
  });

  const peopleWithState: SelectablePerson[] = useMemo(() => {
    const pinnedIndexMap = new Map(pinnedPersonIds.map((id, idx) => [normalizePersonId(id), idx]));
    const existingIds = new Set(people.map((person) => normalizePersonId(person.pubkey)));
    const stubs: SelectablePerson[] = pinnedPersonIds
      .filter((id) => !existingIds.has(normalizePersonId(id)))
      .map((id) => ({
        pubkey: id,
        name: id,
        displayName: id,
      }));

    return [...stubs, ...people].sort((a, b) => {
      const aIdx = pinnedIndexMap.get(normalizePersonId(a.pubkey)) ?? Infinity;
      const bIdx = pinnedIndexMap.get(normalizePersonId(b.pubkey)) ?? Infinity;
      return aIdx - bIdx;
    });
  }, [people, pinnedPersonIds]);

  return { pinnedPersonIds, peopleWithState, handlePersonPin, handlePersonUnpin };
}
