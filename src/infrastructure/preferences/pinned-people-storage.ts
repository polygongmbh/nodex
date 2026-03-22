import {
  createEmptyPinnedPeopleState,
  type PinnedPeopleState,
} from "@/domain/preferences/pinned-person-state";
import { loadPinnedEntityState, savePinnedEntityState } from "./pinned-entity-storage";

const PINNED_PEOPLE_NAMESPACE = "pinned-people";

export function loadPinnedPeopleState(pubkey?: string): PinnedPeopleState {
  return loadPinnedEntityState({
    namespace: PINNED_PEOPLE_NAMESPACE,
    idKey: "personId",
    pubkey,
    createEmptyState: createEmptyPinnedPeopleState,
  });
}

export function savePinnedPeopleState(state: PinnedPeopleState, pubkey?: string): void {
  savePinnedEntityState({
    namespace: PINNED_PEOPLE_NAMESPACE,
    state,
    pubkey,
  });
}
