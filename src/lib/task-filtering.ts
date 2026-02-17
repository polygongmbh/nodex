import type { Channel, Person, Task } from "@/types";
import { taskMatchesSelectedPeople } from "@/lib/person-filter";

interface FilterTasksParams {
  tasks: Task[];
  activeRelayIds: Set<string>;
  channels: Channel[];
  people: Person[];
}

function toLowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

export function filterTasks({
  tasks,
  activeRelayIds,
  channels,
  people,
}: FilterTasksParams): Task[] {
  const selectedPeople = people.filter((person) => person.isSelected);
  const includedChannelNames = channels
    .filter((channel) => channel.filterState === "included")
    .map((channel) => channel.name);
  const excludedChannelNames = channels
    .filter((channel) => channel.filterState === "excluded")
    .map((channel) => channel.name);
  const includedChannelSet = toLowerSet(includedChannelNames);
  const excludedChannelSet = toLowerSet(excludedChannelNames);
  const hasActiveChannelFilters = includedChannelSet.size > 0 || excludedChannelSet.size > 0;

  return tasks.filter((task) => {
    if (activeRelayIds.size > 0 && !task.relays.some((relayId) => activeRelayIds.has(relayId))) {
      return false;
    }

    if (!hasActiveChannelFilters && task.tags.length > 10) {
      return false;
    }

    if (!taskMatchesSelectedPeople(task, selectedPeople)) {
      return false;
    }

    if (excludedChannelSet.size > 0) {
      const taskTags = task.tags.map((tag) => tag.toLowerCase());
      if (taskTags.some((tag) => excludedChannelSet.has(tag))) {
        return false;
      }
    }

    if (includedChannelSet.size > 0) {
      const taskTagSet = toLowerSet(task.tags);
      for (const includedChannel of includedChannelSet) {
        if (!taskTagSet.has(includedChannel)) {
          return false;
        }
      }
    }

    return true;
  });
}
