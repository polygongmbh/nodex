import type { Channel, Person } from "@/types";

export function buildChannelFilterMap(
  channels: Channel[],
  resolveState: (channel: Channel) => Channel["filterState"]
): Map<string, Channel["filterState"]> {
  const next = new Map<string, Channel["filterState"]>();
  for (const channel of channels) {
    next.set(channel.id, resolveState(channel));
  }
  return next;
}

export function setAllChannelFilters(
  channels: Channel[],
  state: Channel["filterState"]
): Map<string, Channel["filterState"]> {
  return buildChannelFilterMap(channels, () => state);
}

export function setExclusiveChannelFilter(
  channels: Channel[],
  includedChannelId: string
): Map<string, Channel["filterState"]> {
  return buildChannelFilterMap(channels, (channel) =>
    channel.id === includedChannelId ? "included" : "neutral"
  );
}

export function mapPeopleSelection(
  people: Person[],
  isSelectedFor: (person: Person) => boolean
): Person[] {
  return people.map((person) => ({
    ...person,
    isSelected: isSelectedFor(person),
  }));
}
