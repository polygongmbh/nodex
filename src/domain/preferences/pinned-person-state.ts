import {
  createEmptyPinnedEntityState,
  getPinnedEntityIdsForRelays,
  isPinnedEntityForAnyRelay,
  pinEntityForRelays,
  unpinEntityFromRelays,
  type PinnedEntityState,
  type PinnedEntityEntry,
} from "./pinned-entity-state";

export type PinnedPersonEntry = PinnedEntityEntry<"personId">;
export type PinnedPeopleState = PinnedEntityState<"personId">;

export function createEmptyPinnedPeopleState(): PinnedPeopleState {
  return createEmptyPinnedEntityState();
}

export function getPinnedPersonIdsForRelays(
  state: PinnedPeopleState,
  relayIds: string[]
): string[] {
  return getPinnedEntityIdsForRelays(state, relayIds, "personId");
}

export function isPersonPinnedForAnyRelay(
  state: PinnedPeopleState,
  relayIds: string[],
  personId: string
): boolean {
  return isPinnedEntityForAnyRelay(state, relayIds, personId, "personId");
}

export function pinPersonForRelays(
  state: PinnedPeopleState,
  relayIds: string[],
  personId: string
): PinnedPeopleState {
  return pinEntityForRelays(state, relayIds, personId, "personId");
}

export function unpinPersonFromRelays(
  state: PinnedPeopleState,
  relayIds: string[],
  personId: string
): PinnedPeopleState {
  return unpinEntityFromRelays(state, relayIds, personId, "personId");
}
