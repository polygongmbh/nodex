import { useCallback, useMemo } from "react";
import type { Channel, Task } from "@/types";
import type { ChannelMatchMode } from "@/types";
import type { Person } from "@/types/person";
import type { FeedSidebarCommands } from "./feed-sidebar-commands-context";
import { usePinnedSidebarChannels } from "./use-pinned-sidebar-channels";
import { usePinnedSidebarPeople } from "./use-pinned-sidebar-people";

export interface UseFeedSidebarCommandsControllerOptions {
  // Pinned state
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  sidebarChannels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
  sidebarPeople: Person[];
  allTasks: Task[];
  // Channel filter commands
  onToggleChannel: (channelId: string) => void;
  onShowOnlyChannel: (channelId: string) => void;
  onToggleAllChannels: () => void;
  onSetChannelMatchMode: (mode: ChannelMatchMode) => void;
  // Person filter commands
  onTogglePerson: (personId: string) => void;
  onShowOnlyPerson: (personId: string) => void;
  onToggleAllPeople: () => void;
  // Relay commands
  onRelaySelect: (relayId: string, mode: "toggle" | "exclusive") => string | null;
  onRelayToggle: (relayId: string) => void;
  onRelayExclusive: (relayId: string) => void;
  onToggleAllRelays: () => void;
  onAddRelay: (url: string) => void;
  onReorderRelays: (orderedUrls: string[]) => void;
  onRemoveRelay: (url: string) => void;
  onReconnectRelay: (url: string) => void;
}

export interface UseFeedSidebarCommandsControllerResult {
  commands: FeedSidebarCommands;
  channelsWithState: Channel[];
  peopleWithState: Person[];
}

export function useFeedSidebarCommandsController({
  userPubkey,
  effectiveActiveRelayIds,
  sidebarChannels,
  channelFilterStates,
  sidebarPeople,
  allTasks,
  onToggleChannel,
  onShowOnlyChannel,
  onToggleAllChannels,
  onSetChannelMatchMode,
  onTogglePerson,
  onShowOnlyPerson,
  onToggleAllPeople,
  onRelaySelect,
  onRelayToggle,
  onRelayExclusive,
  onToggleAllRelays,
  onAddRelay,
  onReorderRelays,
  onRemoveRelay,
  onReconnectRelay,
}: UseFeedSidebarCommandsControllerOptions): UseFeedSidebarCommandsControllerResult {
  const {
    channelsWithState,
    handleChannelPin,
    handleChannelUnpin,
  } = usePinnedSidebarChannels({
    userPubkey,
    effectiveActiveRelayIds,
    channels: sidebarChannels,
    channelFilterStates,
    allTasks,
  });

  const {
    peopleWithState,
    handlePersonPin,
    handlePersonUnpin,
  } = usePinnedSidebarPeople({
    userPubkey,
    effectiveActiveRelayIds,
    people: sidebarPeople,
    allTasks,
  });

  const selectRelay = useCallback((relayId: string, mode: "toggle" | "exclusive") => {
    const reconnectUrl = onRelaySelect(relayId, mode);
    if (reconnectUrl) {
      onReconnectRelay(reconnectUrl);
    }
  }, [onRelaySelect, onReconnectRelay]);

  const commands = useMemo<FeedSidebarCommands>(
    () => ({
      pinChannel: handleChannelPin,
      unpinChannel: handleChannelUnpin,
      toggleChannel: onToggleChannel,
      showOnlyChannel: onShowOnlyChannel,
      toggleAllChannels: onToggleAllChannels,
      setChannelMatchMode: onSetChannelMatchMode,
      pinPerson: handlePersonPin,
      unpinPerson: handlePersonUnpin,
      togglePerson: onTogglePerson,
      showOnlyPerson: onShowOnlyPerson,
      toggleAllPeople: onToggleAllPeople,
      selectRelay,
      toggleRelay: onRelayToggle,
      showOnlyRelay: onRelayExclusive,
      toggleAllRelays: onToggleAllRelays,
      addRelay: onAddRelay,
      reorderRelays: onReorderRelays,
      removeRelay: onRemoveRelay,
      reconnectRelay: onReconnectRelay,
    }),
    [
      handleChannelPin, handleChannelUnpin,
      onToggleChannel, onShowOnlyChannel, onToggleAllChannels, onSetChannelMatchMode,
      handlePersonPin, handlePersonUnpin,
      onTogglePerson, onShowOnlyPerson, onToggleAllPeople,
      selectRelay, onRelayToggle, onRelayExclusive, onToggleAllRelays,
      onAddRelay, onReorderRelays, onRemoveRelay, onReconnectRelay,
    ]
  );

  return { commands, channelsWithState, peopleWithState };
}
