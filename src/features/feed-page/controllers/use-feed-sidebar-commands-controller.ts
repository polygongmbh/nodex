import { useMemo } from "react";
import type { Channel, Task } from "@/types";
import type { Person } from "@/types/person";
import type { FeedSidebarCommands } from "./feed-sidebar-commands-context";
import { usePinnedSidebarChannels } from "./use-pinned-sidebar-channels";
import { usePinnedSidebarPeople } from "./use-pinned-sidebar-people";

export interface UseFeedSidebarCommandsControllerOptions {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  sidebarChannels: Channel[];
  channelFilterStates: Map<string, Channel["filterState"]>;
  sidebarPeople: Person[];
  allTasks: Task[];
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

  const commands = useMemo<FeedSidebarCommands>(
    () => ({
      pinChannel: handleChannelPin,
      unpinChannel: handleChannelUnpin,
      pinPerson: handlePersonPin,
      unpinPerson: handlePersonUnpin,
    }),
    [handleChannelPin, handleChannelUnpin, handlePersonPin, handlePersonUnpin]
  );

  return { commands, channelsWithState, peopleWithState };
}
