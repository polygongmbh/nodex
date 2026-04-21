import { createContext, useContext, type PropsWithChildren } from "react";
import type { ChannelMatchMode } from "@/types";

export interface FeedSidebarCommands {
  // Channel pin/unpin
  pinChannel(channelId: string): void;
  unpinChannel(channelId: string): void;
  // Channel filter
  toggleChannel(channelId: string): void;
  showOnlyChannel(channelId: string): void;
  toggleAllChannels(): void;
  setChannelMatchMode(mode: ChannelMatchMode): void;
  // Person pin/unpin
  pinPerson(personId: string): void;
  unpinPerson(personId: string): void;
  // Person filter
  togglePerson(personId: string): void;
  showOnlyPerson(personId: string): void;
  toggleAllPeople(): void;
  // Relay
  selectRelay(relayId: string, mode: "toggle" | "exclusive"): void;
  toggleRelay(relayId: string): void;
  showOnlyRelay(relayId: string): void;
  toggleAllRelays(): void;
  addRelay(url: string): void;
  reorderRelays(orderedUrls: string[]): void;
  removeRelay(url: string): void;
  reconnectRelay(url: string): void;
}

const defaultCommands: FeedSidebarCommands = {
  pinChannel: () => {},
  unpinChannel: () => {},
  toggleChannel: () => {},
  showOnlyChannel: () => {},
  toggleAllChannels: () => {},
  setChannelMatchMode: () => {},
  pinPerson: () => {},
  unpinPerson: () => {},
  togglePerson: () => {},
  showOnlyPerson: () => {},
  toggleAllPeople: () => {},
  selectRelay: () => {},
  toggleRelay: () => {},
  showOnlyRelay: () => {},
  toggleAllRelays: () => {},
  addRelay: () => {},
  reorderRelays: () => {},
  removeRelay: () => {},
  reconnectRelay: () => {},
};

const FeedSidebarCommandsContext = createContext<FeedSidebarCommands>(defaultCommands);

interface FeedSidebarCommandsProviderProps extends PropsWithChildren {
  value: FeedSidebarCommands;
}

export function FeedSidebarCommandsProvider({ value, children }: FeedSidebarCommandsProviderProps) {
  return (
    <FeedSidebarCommandsContext.Provider value={value}>
      {children}
    </FeedSidebarCommandsContext.Provider>
  );
}

export function useFeedSidebarCommands(): FeedSidebarCommands {
  return useContext(FeedSidebarCommandsContext);
}
