import { useMemo, useCallback } from "react";
import type { Channel, Task } from "@/types";
import {
  getPinnedChannelIdsForRelays,
  pinChannelForRelays,
  unpinChannelFromRelays,
  type PinnedChannelsState,
} from "@/domain/preferences/pinned-channel-state";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
} from "@/infrastructure/preferences/pinned-channels-storage";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";

export interface UsePinnedSidebarChannelsOptions {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  channels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
  allTasks: Task[];
}

export interface UsePinnedSidebarChannelsResult {
  pinnedChannelsState: PinnedChannelsState;
  activeRelayIdList: string[];
  pinnedChannelIds: string[];
  channelRelayIds: Map<string, Set<string>>;
  channelsWithState: Channel[];
  handleChannelPin: (id: string) => void;
  handleChannelUnpin: (id: string) => void;
}

export function usePinnedSidebarChannels({
  userPubkey,
  effectiveActiveRelayIds,
  channels,
  channelFilterStates,
  allTasks,
}: UsePinnedSidebarChannelsOptions): UsePinnedSidebarChannelsResult {
  const {
    state: pinnedChannelsState,
    activeRelayIdList,
    pinnedIds: pinnedChannelIds,
    pinAcrossRelays,
    unpinAcrossRelays,
  } = usePinnedSidebarEntityState<PinnedChannelsState>({
    userPubkey,
    effectiveActiveRelayIds,
    loadState: loadPinnedChannelsState,
    saveState: savePinnedChannelsState,
    getPinnedIdsForRelays: getPinnedChannelIdsForRelays,
    pinForRelays: pinChannelForRelays,
    unpinFromRelays: unpinChannelFromRelays,
  });

  const channelRelayIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const task of allTasks) {
      for (const tag of task.tags) {
        let relays = map.get(tag);
        if (!relays) {
          relays = new Set();
          map.set(tag, relays);
        }
        for (const relayId of task.relays) relays.add(relayId);
      }
    }
    return map;
  }, [allTasks]);

  const channelsWithState: Channel[] = useMemo(() => {
    const pinnedSet = new Set(pinnedChannelIds);
    const existingIds = new Set(channels.map((c) => c.id));
    const stubs: Channel[] = pinnedChannelIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, name: id, usageCount: 0, filterState: "neutral" as const }));
    return [...stubs, ...channels]
      .map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) ?? "neutral",
      }))
      .sort((a, b) => {
        const aIdx = pinnedSet.has(a.id) ? pinnedChannelIds.indexOf(a.id) : Infinity;
        const bIdx = pinnedSet.has(b.id) ? pinnedChannelIds.indexOf(b.id) : Infinity;
        return aIdx - bIdx;
      });
  }, [
    channels,
    channelFilterStates,
    pinnedChannelIds,
  ]);

  const handleChannelPin = useCallback(
    (id: string) => {
      const relaysWithTag = channelRelayIds.get(id);
      const targetRelayIds = relaysWithTag
        ? activeRelayIdList.filter((r) => relaysWithTag.has(r))
        : activeRelayIdList;
      const relayIds = targetRelayIds.length > 0 ? targetRelayIds : activeRelayIdList;
      pinAcrossRelays(relayIds, id);
    },
    [activeRelayIdList, channelRelayIds, pinAcrossRelays]
  );

  const handleChannelUnpin = useCallback(
    (id: string) => {
      unpinAcrossRelays(id);
    },
    [unpinAcrossRelays]
  );

  return {
    pinnedChannelsState,
    activeRelayIdList,
    pinnedChannelIds,
    channelRelayIds,
    channelsWithState,
    handleChannelPin,
    handleChannelUnpin,
  };
}
