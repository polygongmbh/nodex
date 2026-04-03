import type { Channel, ChannelMatchMode, QuickFilterState, Relay } from "@/types";
import type { Person } from "@/types/person";

interface BuildFeedDisclosureResetKeyOptions {
  focusedTaskId?: string | null;
  searchQuery: string;
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  quickFilters: QuickFilterState;
  channelMatchMode?: ChannelMatchMode;
}

export function buildFeedDisclosureResetKey({
  focusedTaskId,
  searchQuery,
  relays,
  channels,
  people,
  quickFilters,
  channelMatchMode = "and",
}: BuildFeedDisclosureResetKeyOptions): string {
  const activeRelayScopeKey = relays
    .filter((relay) => relay.isActive)
    .map((relay) => relay.id)
    .sort()
    .join(",");
  const activeChannelFiltersKey = channels
    .filter((channel) => channel.filterState && channel.filterState !== "neutral")
    .map((channel) => `${channel.id}:${channel.filterState}`)
    .sort()
    .join(",");
  const selectedPeopleKey = people
    .filter((person) => person.isSelected)
    .map((person) => person.id)
    .sort()
    .join(",");
  const quickFiltersKey = [
    quickFilters.recentEnabled ? `recent:${quickFilters.recentDays}` : "recent:off",
    quickFilters.priorityEnabled ? `priority:${quickFilters.minPriority}` : "priority:off",
  ].join("|");

  return [
    focusedTaskId || "",
    searchQuery.trim().toLowerCase(),
    channelMatchMode,
    activeRelayScopeKey,
    activeChannelFiltersKey,
    selectedPeopleKey,
    quickFiltersKey,
  ].join("|");
}
