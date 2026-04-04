import { useMemo, useCallback } from "react";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
import {
  getPinnedPersonIdsForRelays,
  pinPersonForRelays,
  unpinPersonFromRelays,
  type PinnedPeopleState,
} from "@/domain/preferences/pinned-person-state";
import {
  loadPinnedPeopleState,
  savePinnedPeopleState,
} from "@/infrastructure/preferences/pinned-people-storage";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";

function normalizePersonId(id: string): string {
  return id.trim().toLowerCase();
}

export interface UsePinnedSidebarPeopleOptions {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  people: Person[];
  allTasks: Task[];
}

export interface UsePinnedSidebarPeopleResult {
  pinnedPeopleState: PinnedPeopleState;
  activeRelayIdList: string[];
  pinnedPersonIds: string[];
  personRelayIds: Map<string, Set<string>>;
  peopleWithState: Person[];
  handlePersonPin: (id: string) => void;
  handlePersonUnpin: (id: string) => void;
}

export function usePinnedSidebarPeople({
  userPubkey,
  effectiveActiveRelayIds,
  people,
  allTasks,
}: UsePinnedSidebarPeopleOptions): UsePinnedSidebarPeopleResult {
  const {
    state: pinnedPeopleState,
    activeRelayIdList,
    pinnedIds: pinnedPersonIds,
    pinAcrossRelays,
    unpinAcrossRelays,
  } = usePinnedSidebarEntityState<PinnedPeopleState>({
    userPubkey,
    effectiveActiveRelayIds,
    loadState: loadPinnedPeopleState,
    saveState: savePinnedPeopleState,
    getPinnedIdsForRelays: getPinnedPersonIdsForRelays,
    pinForRelays: pinPersonForRelays,
    unpinFromRelays: unpinPersonFromRelays,
  });

  const personRelayIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const task of allTasks) {
      const authorId = normalizePersonId(task.author?.id || "");
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

  const peopleWithState: Person[] = useMemo(() => {
    const pinnedSet = new Set(pinnedPersonIds.map(normalizePersonId));
    const existingIds = new Set(people.map((person) => normalizePersonId(person.id)));
    const stubs: Person[] = pinnedPersonIds
      .filter((id) => !existingIds.has(normalizePersonId(id)))
      .map((id) => ({
        id,
        name: id,
        displayName: id,
        isOnline: false,
        onlineStatus: "offline" as const,
        isSelected: false,
      }));

    return [...stubs, ...people].sort((a, b) => {
      const aIdx = pinnedSet.has(normalizePersonId(a.id))
        ? pinnedPersonIds.findIndex((id) => normalizePersonId(id) === normalizePersonId(a.id))
        : Infinity;
      const bIdx = pinnedSet.has(normalizePersonId(b.id))
        ? pinnedPersonIds.findIndex((id) => normalizePersonId(id) === normalizePersonId(b.id))
        : Infinity;
      return aIdx - bIdx;
    });
  }, [people, pinnedPersonIds]);

  const handlePersonPin = useCallback(
    (id: string) => {
      const relaysWithPerson = personRelayIds.get(normalizePersonId(id));
      const targetRelayIds = relaysWithPerson
        ? activeRelayIdList.filter((relayId) => relaysWithPerson.has(relayId))
        : activeRelayIdList;
      const relayIds = targetRelayIds.length > 0 ? targetRelayIds : activeRelayIdList;
      pinAcrossRelays(relayIds, id);
    },
    [activeRelayIdList, personRelayIds, pinAcrossRelays]
  );

  const handlePersonUnpin = useCallback(
    (id: string) => {
      unpinAcrossRelays(id);
    },
    [unpinAcrossRelays]
  );

  return {
    pinnedPeopleState,
    activeRelayIdList,
    pinnedPersonIds,
    personRelayIds,
    peopleWithState,
    handlePersonPin,
    handlePersonUnpin,
  };
}
