import type { Channel, ChannelMatchMode, Post } from "@/types";
import type { Person } from "@/types/person";
import { taskMatchesSelectedPeople } from "@/domain/content/person-filter";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/domain/content/channel-filtering";

interface FilterTasksByRelayAndPeopleParams {
  tasks: Post[];
  activeRelayIds: Set<string>;
  // The people the feed is scoped to, already resolved from the store's
  // selectedPubkeys. People (not just pubkeys) because matching also looks at
  // name/displayName for @mention scoping.
  selectedPeople: Person[];
  allowUnknownRelayMetadata?: boolean;
}

interface FilterTasksParams {
  tasks: Post[];
  activeRelayIds: Set<string>;
  channels: Channel[];
  selectedPeople: Person[];
  channelMatchMode: ChannelMatchMode;
  allowUnknownRelayMetadata?: boolean;
}

export function filterTasksByRelayAndPeople({
  tasks,
  activeRelayIds,
  selectedPeople,
  allowUnknownRelayMetadata = true,
}: FilterTasksByRelayAndPeopleParams): Post[] {
  return tasks.filter((task) => {
    const hasUnknownRelayMetadata =
      task.relays.length === 0 ||
      task.relays.some((relayId) => relayId === "nostr" || relayId === "unknown");
    if (
      activeRelayIds.size > 0 &&
      (!allowUnknownRelayMetadata || !hasUnknownRelayMetadata) &&
      !task.relays.some((relayId) => activeRelayIds.has(relayId))
    ) {
      return false;
    }

    return taskMatchesSelectedPeople(task, selectedPeople);
  });
}

export function filterTasks({
  tasks,
  activeRelayIds,
  channels,
  selectedPeople,
  channelMatchMode,
  allowUnknownRelayMetadata = true,
}: FilterTasksParams): Post[] {
  const { included, excluded } = getIncludedExcludedChannelNames(channels);
  return filterTasksByRelayAndPeople({
    tasks,
    activeRelayIds,
    selectedPeople,
    allowUnknownRelayMetadata,
  }).filter((task) =>
    taskMatchesChannelFilters(task.tags, included, excluded, channelMatchMode)
  );
}
