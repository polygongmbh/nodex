import { useMemo } from "react";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import {
  buildTaskViewFilterIndex,
  filterTasksForView,
  type TaskViewFilterRequest,
} from "@/domain/content/task-view-filtering";
import type { Channel, ChannelMatchMode, QuickFilterState, Task } from "@/types";
import type { SelectablePerson } from "@/types/person";

interface UseTaskViewFilteringParams<T extends Task = Task> {
  allTasks: Task[];
  tasks: Task[];
  focusedTaskId: string | null;
  includeFocusedTask?: boolean;
  hideClosedTasks?: boolean;
  searchQuery: string;
  people: SelectablePerson[];
  quickFilters?: QuickFilterState;
  channels: Channel[];
  channelMatchMode: ChannelMatchMode;
  /**
   * Narrows the candidate list. Pass a type guard and parameterize the hook
   * (e.g. `useTaskViewFiltering<TaskPost>(...)`) to get a properly narrowed
   * result without a follow-up refilter.
   */
  taskPredicate?: (task: Task) => boolean;
}

export function useTaskViewFiltering<T extends Task = Task>({
  allTasks,
  tasks,
  focusedTaskId,
  includeFocusedTask = false,
  hideClosedTasks = false,
  searchQuery,
  people,
  quickFilters,
  channels,
  channelMatchMode,
  taskPredicate,
}: UseTaskViewFilteringParams<T>): T[] {
  const filterIndex = useMemo(
    () => buildTaskViewFilterIndex(allTasks, people),
    [allTasks, people]
  );
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const prefilteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const request = useMemo<TaskViewFilterRequest>(
    () => ({
      source: {
        allTasks,
        filterIndex,
        prefilteredTaskIds,
        people,
      },
      scope: {
        focusedTaskId,
        includeFocusedTask,
        hideClosedTasks,
        taskPredicate,
      },
      criteria: {
        searchQuery,
        quickFilters,
        channels: {
          included,
          excluded,
          matchMode: channelMatchMode,
        },
      },
    }),
    [
      allTasks,
      channelMatchMode,
      excluded,
      filterIndex,
      focusedTaskId,
      hideClosedTasks,
      includeFocusedTask,
      included,
      people,
      prefilteredTaskIds,
      quickFilters,
      searchQuery,
      taskPredicate,
    ]
  );

  return useMemo(
    () => filterTasksForView(request) as T[],
    [request]
  );
}
