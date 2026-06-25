import { createContext, useContext, type PropsWithChildren } from "react";
import type { ChannelMatchMode, Post, QuickFilterState, SavedFilterConfiguration } from "@/types";
import type { Relay, Channel } from "@/types";
import type { Person } from "@/types/person";
import type { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";

export interface FeedSidebarState {
  relays: Relay[];
  channels: Channel[];
  collapsedPreviewChannels?: Channel[];
  channelMatchMode: ChannelMatchMode;
  people: Person[];
  collapsedPreviewPeople?: Person[];
  pinnedPersonIds: string[];
  nostrRelays: NDKRelayStatus[];
  isFocused: boolean;
  quickFilters?: QuickFilterState;
  savedFilterConfigurations: SavedFilterConfiguration[];
  activeSavedFilterConfigurationId: string | null;
  /** Relay-scoped posts feeding the Projects section. */
  posts?: Post[];
  focusedTaskId?: string | null;
}

const defaultSidebarState: FeedSidebarState = {
  relays: [],
  channels: [],
  collapsedPreviewChannels: undefined,
  channelMatchMode: "and",
  people: [],
  collapsedPreviewPeople: undefined,
  pinnedPersonIds: [],
  nostrRelays: [],
  isFocused: false,
  quickFilters: undefined,
  savedFilterConfigurations: [],
  activeSavedFilterConfigurationId: null,
  posts: [],
  focusedTaskId: null,
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
