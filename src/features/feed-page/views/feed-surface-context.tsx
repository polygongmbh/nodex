import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { normalizeQuickFilterState } from "@/domain/content/quick-filter-constraints";
import type { Channel, QuickFilterState, Relay } from "@/types";
import type { SelectablePerson } from "@/types/person";

export interface FeedSurfaceState {
  relays: Relay[];
  channels: Channel[];
  visibleChannels?: Channel[];
  primaryChannels?: Channel[];
  people: SelectablePerson[];
  visiblePeople?: SelectablePerson[];
  mentionablePeople?: SelectablePerson[];
  quickFilters: QuickFilterState;
}

const defaultFeedSurfaceState: FeedSurfaceState = {
  relays: [],
  channels: [],
  visibleChannels: [],
  primaryChannels: [],
  people: [],
  visiblePeople: [],
  mentionablePeople: [],
  quickFilters: normalizeQuickFilterState(),
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
  const { relays, channels, people, mentionablePeople } = useFeedSurfaceState();
  return useMemo(
    () => ({
      relays,
      channels,
      people,
      mentionablePeople: mentionablePeople || people,
    }),
    [channels, mentionablePeople, people, relays]
  );
}

export function useFeedPeopleById() {
  const { people } = useFeedSurfaceState();
  return useMemo(
    () =>
      new Map(
        people.map((person) => [person.pubkey.toLowerCase(), person] as const)
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
