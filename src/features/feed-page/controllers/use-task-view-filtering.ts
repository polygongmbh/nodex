import { useMemo } from "react";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { filterTasksForView } from "@/domain/content/task-view-filtering";
import type { Channel, ChannelMatchMode, Person, Task } from "@/types";

interface UseTaskViewFilteringParams {
  allTasks: Task[];
  tasks: Task[];
  focusedTaskId?: string | null;
  includeFocusedTask?: boolean;
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

  return useMemo(
    () =>
      filterTasksForView({
        allTasks,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask,
        searchQuery,
        people,
        includedChannels: included,
        excludedChannels: excluded,
        channelMatchMode,
        taskPredicate,
      }),
    [
      allTasks,
      channelMatchMode,
      excluded,
      focusedTaskId,
      includeFocusedTask,
      included,
      people,
      prefilteredTaskIds,
      searchQuery,
      taskPredicate,
    ]
  );
}
