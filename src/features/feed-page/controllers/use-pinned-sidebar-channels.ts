import { useMemo } from "react";
import type { Channel, Task } from "@/types";
import { usePinnedSidebarEntityState } from "./use-pinned-sidebar-entity-state";

export interface UsePinnedSidebarChannelsOptions {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  channels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
  allTasks: Task[];
}

export interface UsePinnedSidebarChannelsResult {
  pinnedChannelIds: string[];
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

  const {
    pinnedIds: pinnedChannelIds,
    pinAcrossRelays: handleChannelPin,
    unpinAcrossRelays: handleChannelUnpin,
  } = usePinnedSidebarEntityState({
    userPubkey,
    effectiveActiveRelayIds,
    entityRelayIds: channelRelayIds,
    namespace: "pinned-channels",
    idKey: "channelId" as const,
  });

  const channelsWithState: Channel[] = useMemo(() => {
    const pinnedSet = new Set(pinnedChannelIds);
    const existingIds = new Set(channels.map((c) => c.id));
    const stubs: Channel[] = pinnedChannelIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, name: id, usageCount: 0, filterState: "neutral" as const, isPinned: true }));
    return [...stubs, ...channels]
      .map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) ?? "neutral",
        isPinned: pinnedSet.has(channel.id),
      }))
      .sort((a, b) => {
        const aIdx = pinnedSet.has(a.id) ? pinnedChannelIds.indexOf(a.id) : Infinity;
        const bIdx = pinnedSet.has(b.id) ? pinnedChannelIds.indexOf(b.id) : Infinity;
        return aIdx - bIdx;
      });
  }, [channels, channelFilterStates, pinnedChannelIds]);

  return { pinnedChannelIds, channelsWithState, handleChannelPin, handleChannelUnpin };
}
