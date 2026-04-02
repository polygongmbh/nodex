import {
  createEmptyPinnedChannelsState,
  type PinnedChannelsState,
} from "@/domain/preferences/pinned-channel-state";
import { loadPinnedEntityState, savePinnedEntityState } from "./pinned-entity-storage";

const PINNED_CHANNELS_NAMESPACE = "pinned-channels";

export function loadPinnedChannelsState(pubkey?: string): PinnedChannelsState {
  return loadPinnedEntityState({
    namespace: PINNED_CHANNELS_NAMESPACE,
    idKey: "channelId",
    pubkey,
    createEmptyState: createEmptyPinnedChannelsState,
  });
}

export function savePinnedChannelsState(state: PinnedChannelsState, pubkey?: string): void {
  savePinnedEntityState({
    namespace: PINNED_CHANNELS_NAMESPACE,
    state,
    pubkey,
  });
}
