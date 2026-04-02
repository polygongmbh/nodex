import {
  createEmptyPinnedEntityState,
  getPinnedEntityIdsForRelays,
  isPinnedEntityForAnyRelay,
  pinEntityForRelays,
  unpinEntityFromRelays,
  type PinnedEntityEntry,
  type PinnedEntityState,
} from "./pinned-entity-state";

export type PinnedChannelEntry = PinnedEntityEntry<"channelId">;
export type PinnedChannelsState = PinnedEntityState<"channelId">;

export function createEmptyPinnedChannelsState(): PinnedChannelsState {
  return createEmptyPinnedEntityState();
}

export function getPinnedChannelIdsForRelays(
  state: PinnedChannelsState,
  relayIds: string[]
): string[] {
  return getPinnedEntityIdsForRelays(state, relayIds, "channelId");
}

export function isChannelPinnedForAnyRelay(
  state: PinnedChannelsState,
  relayIds: string[],
  channelId: string
): boolean {
  return isPinnedEntityForAnyRelay(state, relayIds, channelId, "channelId");
}

export function pinChannelForRelays(
  state: PinnedChannelsState,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  return pinEntityForRelays(state, relayIds, channelId, "channelId");
}

export function unpinChannelFromRelays(
  state: PinnedChannelsState,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  return unpinEntityFromRelays(state, relayIds, channelId, "channelId");
}
