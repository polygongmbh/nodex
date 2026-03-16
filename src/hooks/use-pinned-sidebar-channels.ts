import { useState, useEffect, useMemo, useCallback } from "react";
import type { Channel, Task } from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import {
  loadPinnedChannelsState,
  savePinnedChannelsState,
  getPinnedChannelIdsForView,
  pinChannelForRelays,
  unpinChannelFromRelays,
  type PinnedChannelsState,
} from "@/lib/pinned-channels-preferences";
export interface UsePinnedSidebarChannelsOptions {
  userPubkey: string | undefined;
  currentView: ViewType;
  effectiveActiveRelayIds: Set<string>;
  channels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
  allTasks: Task[];
}

export interface UsePinnedSidebarChannelsResult {
  pinnedChannelsState: PinnedChannelsState;
  activeRelayIdList: string[];
  channelRelayIds: Map<string, Set<string>>;
  channelsWithState: Channel[];
  handleChannelPin: (id: string) => void;
  handleChannelUnpin: (id: string) => void;
}

export function usePinnedSidebarChannels({
  userPubkey,
  currentView,
  effectiveActiveRelayIds,
  channels,
  channelFilterStates,
  allTasks,
}: UsePinnedSidebarChannelsOptions): UsePinnedSidebarChannelsResult {
  const [pinnedChannelsState, setPinnedChannelsState] = useState<PinnedChannelsState>(
    () => loadPinnedChannelsState(userPubkey)
  );

  // Reload pinned state when the authenticated user changes
  useEffect(() => {
    setPinnedChannelsState(loadPinnedChannelsState(userPubkey));
  }, [userPubkey]);

  useEffect(() => {
    savePinnedChannelsState(pinnedChannelsState, userPubkey);
  }, [pinnedChannelsState, userPubkey]);

  const activeRelayIdList = useMemo(
    () => Array.from(effectiveActiveRelayIds),
    [effectiveActiveRelayIds]
  );

  // Map each channel ID to the relay IDs that have at least one post with that tag
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

  // Merge dynamic channels with persisted filter states, pinned channels sorted first
  const channelsWithState: Channel[] = useMemo(() => {
    const pinnedIds = getPinnedChannelIdsForView(
      pinnedChannelsState,
      currentView,
      activeRelayIdList
    );
    const pinnedSet = new Set(pinnedIds);
    const existingIds = new Set(channels.map((c) => c.id));
    const stubs: Channel[] = pinnedIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, name: id, usageCount: 0, filterState: "neutral" as const }));
    return [...stubs, ...channels]
      .map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) ?? "neutral",
      }))
      .sort((a, b) => {
        const aIdx = pinnedSet.has(a.id) ? pinnedIds.indexOf(a.id) : Infinity;
        const bIdx = pinnedSet.has(b.id) ? pinnedIds.indexOf(b.id) : Infinity;
        return aIdx - bIdx;
      });
  }, [
    channels,
    channelFilterStates,
    pinnedChannelsState,
    currentView,
    activeRelayIdList,
  ]);

  const handleChannelPin = useCallback(
    (id: string) => {
      // Pin for each active relay that has at least one post with this tag.
      // Fall back to all active relays if none have the tag yet.
      const relaysWithTag = channelRelayIds.get(id);
      const targetRelayIds = relaysWithTag
        ? activeRelayIdList.filter((r) => relaysWithTag.has(r))
        : activeRelayIdList;
      const relayIds = targetRelayIds.length > 0 ? targetRelayIds : activeRelayIdList;
      setPinnedChannelsState((prev) => pinChannelForRelays(prev, currentView, relayIds, id));
    },
    [activeRelayIdList, channelRelayIds, currentView]
  );

  const handleChannelUnpin = useCallback(
    (id: string) => {
      // Unpin from all active relays.
      setPinnedChannelsState((prev) =>
        unpinChannelFromRelays(prev, currentView, activeRelayIdList, id)
      );
    },
    [activeRelayIdList, currentView]
  );

  return {
    pinnedChannelsState,
    activeRelayIdList,
    channelRelayIds,
    channelsWithState,
    handleChannelPin,
    handleChannelUnpin,
  };
}
