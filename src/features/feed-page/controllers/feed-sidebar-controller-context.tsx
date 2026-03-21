import { createContext, useContext, type PropsWithChildren } from "react";
import type { ChannelMatchMode, QuickFilterState, SavedFilterConfiguration } from "@/types";
import type { Relay, Channel, Person } from "@/types";
import type { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";

export interface FeedSidebarState {
  relays: Relay[];
  channels: Channel[];
  channelMatchMode: ChannelMatchMode;
  people: Person[];
  nostrRelays: NDKRelayStatus[];
  isFocused: boolean;
  quickFilters?: QuickFilterState;
  pinnedChannelIds: string[];
  savedFilterConfigurations: SavedFilterConfiguration[];
  activeSavedFilterConfigurationId: string | null;
}

const defaultSidebarState: FeedSidebarState = {
  relays: [],
  channels: [],
  channelMatchMode: "and",
  people: [],
  nostrRelays: [],
  isFocused: false,
  quickFilters: undefined,
  pinnedChannelIds: [],
  savedFilterConfigurations: [],
  activeSavedFilterConfigurationId: null,
};

const FeedSidebarControllerContext = createContext<FeedSidebarState>(defaultSidebarState);

interface FeedSidebarControllerProviderProps extends PropsWithChildren {
  value: FeedSidebarState;
}

export function FeedSidebarControllerProvider({
  value,
  children,
}: FeedSidebarControllerProviderProps) {
  return (
    <FeedSidebarControllerContext.Provider value={value}>
      {children}
    </FeedSidebarControllerContext.Provider>
  );
}

export function useFeedSidebarController(): FeedSidebarState {
  return useContext(FeedSidebarControllerContext);
}
