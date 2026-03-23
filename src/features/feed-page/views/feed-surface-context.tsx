import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import type { Channel, ChannelMatchMode, Person, Relay } from "@/types";

export interface FeedSurfaceState {
  relays: Relay[];
  channels: Channel[];
  composeChannels?: Channel[];
  people: Person[];
  searchQuery: string;
  channelMatchMode?: ChannelMatchMode;
}

const defaultFeedSurfaceState: FeedSurfaceState = {
  relays: [],
  channels: [],
  composeChannels: [],
  people: [],
  searchQuery: "",
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
  const { relays, channels, composeChannels, people } = useFeedSurfaceState();
  return useMemo(
    () => ({
      relays,
      channels: composeChannels || channels,
      people,
    }),
    [channels, composeChannels, people, relays]
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
