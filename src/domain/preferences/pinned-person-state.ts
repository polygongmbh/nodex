import {
  createEmptyPinnedEntityState,
  getPinnedEntityIdsForView,
  isPinnedEntityForAnyRelay,
  pinEntityForRelays,
  unpinEntityFromRelays,
  type PinnedEntityState,
  type ViewPinnedEntityEntry,
} from "./pinned-entity-state";

export type ViewPinnedPersonEntry = ViewPinnedEntityEntry<"personId">;
export type PinnedPeopleState = PinnedEntityState<"personId">;

export function createEmptyPinnedPeopleState(): PinnedPeopleState {
  return createEmptyPinnedEntityState();
}

export function getPinnedPersonIdsForView(
  state: PinnedPeopleState,
  view: string,
  relayIds: string[]
): string[] {
  return getPinnedEntityIdsForView(state, view, relayIds, "personId");
}

export function isPersonPinnedForAnyRelay(
  state: PinnedPeopleState,
  view: string,
  relayIds: string[],
  personId: string
): boolean {
  return isPinnedEntityForAnyRelay(state, view, relayIds, personId, "personId");
}

export function pinPersonForRelays(
  state: PinnedPeopleState,
  view: string,
  relayIds: string[],
  personId: string
): PinnedPeopleState {
  return pinEntityForRelays(state, view, relayIds, personId, "personId");
}

export function unpinPersonFromRelays(
  state: PinnedPeopleState,
  view: string,
  relayIds: string[],
  personId: string
): PinnedPeopleState {
  return unpinEntityFromRelays(state, view, relayIds, personId, "personId");
}
