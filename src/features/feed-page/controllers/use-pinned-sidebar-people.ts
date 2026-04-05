import { useMemo } from "react";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
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
  pinnedPersonIds: string[];
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

  const peopleWithState: Person[] = useMemo(() => {
    const pinnedIndexMap = new Map(pinnedPersonIds.map((id, idx) => [normalizePersonId(id), idx]));
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

    return [...stubs, ...people]
      .map((person) => ({
        ...person,
        pinIndex: pinnedIndexMap.get(normalizePersonId(person.id)),
      }))
      .sort((a, b) => (a.pinIndex ?? Infinity) - (b.pinIndex ?? Infinity));
  }, [people, pinnedPersonIds]);

  return { pinnedPersonIds, peopleWithState, handlePersonPin, handlePersonUnpin };
}
