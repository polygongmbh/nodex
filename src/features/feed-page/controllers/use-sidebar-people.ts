import { useMemo } from "react";
import { deriveSidebarPeople } from "@/domain/content/sidebar-people";
import {
  getPersonFrecencyScores,
  type PersonFrecencyState,
} from "@/lib/person-frecency";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import type { LatestPresenceSnapshot } from "@/lib/presence-status";
import type { Post } from "@/types";
import type { Person } from "@/types/person";

interface UseSidebarPeopleOptions {
  allTasks: Post[];
  people: Person[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  effectiveActiveRelayIds: Set<string>;
  allRelayIds: string[];
  personFrecencyState: PersonFrecencyState;
}

export function useSidebarPeople({
  allTasks,
  people,
  latestPresenceByAuthor,
  effectiveActiveRelayIds,
  allRelayIds,
  personFrecencyState,
}: UseSidebarPeopleOptions): Person[] {
  const personalizeScores = useMemo(
    () => getPersonFrecencyScores(personFrecencyState),
    [personFrecencyState]
  );

  const scopedTasks = useMemo(() => {
    const sidebarRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      allRelayIds
    );
    return allTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => sidebarRelayScopeIds.has(relayId))
    );
  }, [allTasks, effectiveActiveRelayIds, allRelayIds]);

  return useMemo(
    () =>
      deriveSidebarPeople(
        people,
        scopedTasks,
        latestPresenceByAuthor,
        new Date(),
        { personalizeScores }
      ),
    [latestPresenceByAuthor, people, scopedTasks, personalizeScores]
  );
}
