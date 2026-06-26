import { Sidebar } from "@/components/layout/Sidebar";
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

export function FeedPageSidebar(sidebarState: FeedSidebarState) {
  return <Sidebar {...sidebarState} />;
}
