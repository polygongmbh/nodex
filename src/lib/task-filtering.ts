import type { Channel, ChannelMatchMode, Person, Task } from "@/types";
import { taskMatchesSelectedPeople } from "@/lib/person-filter";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/lib/channel-filtering";

interface FilterTasksParams {
  tasks: Task[];
  activeRelayIds: Set<string>;
  channels: Channel[];
  people: Person[];
  channelMatchMode: ChannelMatchMode;
  allowUnknownRelayMetadata?: boolean;
}

export function filterTasks({
  tasks,
  activeRelayIds,
  channels,
  people,
  channelMatchMode,
  allowUnknownRelayMetadata = true,
}: FilterTasksParams): Task[] {
  const selectedPeople = people.filter((person) => person.isSelected);
  const { included, excluded } = getIncludedExcludedChannelNames(channels);
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

    if (!taskMatchesSelectedPeople(task, selectedPeople)) {
      return false;
    }

    if (!taskMatchesChannelFilters(task.tags, included, excluded, channelMatchMode)) {
      return false;
    }

    return true;
  });
}
