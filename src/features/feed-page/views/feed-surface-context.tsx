import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { normalizeQuickFilterState } from "@/domain/content/quick-filter-constraints";
import type { Channel, ChannelMatchMode, Person, QuickFilterState, Relay } from "@/types";

export interface FeedSurfaceState {
  relays: Relay[];
  channels: Channel[];
  visibleChannels?: Channel[];
  composeChannels?: Channel[];
  people: Person[];
  visiblePeople?: Person[];
  mentionablePeople?: Person[];
  searchQuery: string;
  quickFilters: QuickFilterState;
  channelMatchMode?: ChannelMatchMode;
}

const defaultFeedSurfaceState: FeedSurfaceState = {
  relays: [],
  channels: [],
  visibleChannels: [],
  composeChannels: [],
  people: [],
  visiblePeople: [],
  mentionablePeople: [],
  searchQuery: "",
  quickFilters: normalizeQuickFilterState(),
  channelMatchMode: "and",
};

const FeedSurfaceContext = createContext<FeedSurfaceState>(defaultFeedSurfaceState);

interface FeedSurfaceProviderProps extends PropsWithChildren {
  value: FeedSurfaceState;
}

export function FeedSurfaceProvider({ value, children }: FeedSurfaceProviderProps) {
  return <FeedSurfaceContext.Provider value={value}>{children}</FeedSurfaceContext.Provider>;
}

export function useFeedSurfaceState(): FeedSurfaceState {
  return useContext(FeedSurfaceContext);
}

export function useFeedComposerOptions() {
  const { relays, channels, composeChannels, people, mentionablePeople } = useFeedSurfaceState();
  return useMemo(
    () => ({
      relays,
      channels: composeChannels || channels,
      people,
      mentionablePeople: mentionablePeople || people,
    }),
    [channels, composeChannels, mentionablePeople, people, relays]
  );
}

export function useFeedPeopleById() {
  const { people } = useFeedSurfaceState();
  return useMemo(
    () =>
      new Map(
        people.map((person) => [person.id.toLowerCase(), person] as const)
      ),
    [people]
  );
}

export function useFeedPersonLookup() {
  const peopleById = useFeedPeopleById();

  return useMemo(
    () => ({
      peopleById,
      getPersonById: (personId: string) => peopleById.get(personId.trim().toLowerCase()),
    }),
    [peopleById]
  );
}
