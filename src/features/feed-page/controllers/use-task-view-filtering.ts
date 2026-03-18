import { useMemo } from "react";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { filterTasksForView } from "@/domain/content/task-view-filtering";
import type { Channel, ChannelMatchMode, Person, Task } from "@/types";

interface UseTaskViewFilteringParams {
  allTasks: Task[];
  tasks: Task[];
  focusedTaskId?: string | null;
  includeFocusedTask?: boolean;
  hideClosedTasks?: boolean;
  searchQuery: string;
  people: Person[];
  channels: Channel[];
  channelMatchMode: ChannelMatchMode;
  taskPredicate?: (task: Task) => boolean;
}

export function useTaskViewFiltering({
  allTasks,
  tasks,
  focusedTaskId,
  includeFocusedTask = false,
  hideClosedTasks = false,
  searchQuery,
  people,
  channels,
  channelMatchMode,
  taskPredicate,
}: UseTaskViewFilteringParams): Task[] {
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const prefilteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const availableChannelNames = useMemo(() => {
    const names = new Set<string>();
    for (const task of tasks) {
      for (const tag of task.tags) {
        const normalized = tag.trim().toLowerCase();
        if (normalized) names.add(normalized);
      }
    }
    return names;
  }, [tasks]);
  const effectiveIncludedChannels = useMemo(
    () => included.filter((channel) => availableChannelNames.has(channel)),
    [availableChannelNames, included]
  );
  const effectiveExcludedChannels = useMemo(
    () => excluded.filter((channel) => availableChannelNames.has(channel)),
    [availableChannelNames, excluded]
  );

  return useMemo(
    () =>
      filterTasksForView({
        allTasks,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask,
        hideClosedTasks,
        searchQuery,
        people,
        includedChannels: effectiveIncludedChannels,
        excludedChannels: effectiveExcludedChannels,
        channelMatchMode,
        taskPredicate,
      }),
    [
      allTasks,
      channelMatchMode,
      effectiveExcludedChannels,
      focusedTaskId,
      includeFocusedTask,
      hideClosedTasks,
      effectiveIncludedChannels,
      people,
      prefilteredTaskIds,
      searchQuery,
      taskPredicate,
    ]
  );
}
