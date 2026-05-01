import type { Channel, ChannelMatchMode, Task } from "@/types";
import type { SelectablePerson } from "@/types/person";
import { taskMatchesSelectedPeople } from "@/domain/content/person-filter";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/domain/content/channel-filtering";

interface FilterTasksByRelayAndPeopleParams {
  tasks: Task[];
  activeRelayIds: Set<string>;
  people: SelectablePerson[];
  allowUnknownRelayMetadata?: boolean;
}

interface FilterTasksParams {
  tasks: Task[];
  activeRelayIds: Set<string>;
  channels: Channel[];
  people: SelectablePerson[];
  channelMatchMode: ChannelMatchMode;
  allowUnknownRelayMetadata?: boolean;
}

export function filterTasksByRelayAndPeople({
  tasks,
  activeRelayIds,
  people,
  allowUnknownRelayMetadata = true,
}: FilterTasksByRelayAndPeopleParams): Task[] {
  const selectedPeople = people.filter((person) => person.isSelected);

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
  people,
  channelMatchMode,
  allowUnknownRelayMetadata = true,
}: FilterTasksParams): Task[] {
  const { included, excluded } = getIncludedExcludedChannelNames(channels);
  return filterTasksByRelayAndPeople({
    tasks,
    activeRelayIds,
    people,
    allowUnknownRelayMetadata,
  }).filter((task) =>
    taskMatchesChannelFilters(task.tags, included, excluded, channelMatchMode)
  );
}
