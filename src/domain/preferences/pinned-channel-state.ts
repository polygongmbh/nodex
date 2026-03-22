import {
  createEmptyPinnedEntityState,
  getPinnedEntityIdsForView,
  isPinnedEntityForAnyRelay,
  pinEntityForRelays,
  unpinEntityFromRelays,
  type PinnedEntityState,
  type ViewPinnedEntityEntry,
} from "./pinned-entity-state";

export type ViewPinnedEntry = ViewPinnedEntityEntry<"channelId">;
export type PinnedChannelsState = PinnedEntityState<"channelId">;

export function createEmptyPinnedChannelsState(): PinnedChannelsState {
  return createEmptyPinnedEntityState();
}

export function getPinnedChannelIdsForView(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[]
): string[] {
  return getPinnedEntityIdsForView(state, view, relayIds, "channelId");
}

export function isChannelPinnedForAnyRelay(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[],
  channelId: string
): boolean {
  return isPinnedEntityForAnyRelay(state, view, relayIds, channelId, "channelId");
}

export function pinChannelForRelays(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  return pinEntityForRelays(state, view, relayIds, channelId, "channelId");
}

export function unpinChannelFromRelays(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  return unpinEntityFromRelays(state, view, relayIds, channelId, "channelId");
}
