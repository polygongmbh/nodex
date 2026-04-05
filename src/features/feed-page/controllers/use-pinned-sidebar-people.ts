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
        isPinned: true,
      }));

    return [...stubs, ...people]
      .map((person) => ({
        ...person,
        isPinned: pinnedSet.has(normalizePersonId(person.id)),
      }))
      .sort((a, b) => {
        const aIdx = pinnedSet.has(normalizePersonId(a.id))
          ? pinnedPersonIds.findIndex((id) => normalizePersonId(id) === normalizePersonId(a.id))
          : Infinity;
        const bIdx = pinnedSet.has(normalizePersonId(b.id))
          ? pinnedPersonIds.findIndex((id) => normalizePersonId(id) === normalizePersonId(b.id))
          : Infinity;
        return aIdx - bIdx;
      });
  }, [people, pinnedPersonIds]);

  return { pinnedPersonIds, peopleWithState, handlePersonPin, handlePersonUnpin };
}
