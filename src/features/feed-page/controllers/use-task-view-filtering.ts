import { useMemo } from "react";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import {
  buildTaskViewFilterIndex,
  filterTasksForView,
  type TaskViewFilterRequest,
} from "@/domain/content/task-view-filtering";
import type { Channel, ChannelMatchMode, QuickFilterState, Post } from "@/types";
import type { Person } from "@/types/person";

interface UseTaskViewFilteringParams<T extends Post = Post> {
  posts: Post[];
  focusedTaskId: string | null;
  includeFocusedTask?: boolean;
  hideClosedTasks?: boolean;
  searchQuery: string;
  people: Person[];
  // Explicit (not read from the store) so callers can pass an empty set to get
  // the person-unscoped "neutral" variant, mirroring neutralChannels.
  selectedPubkeys: Set<string>;
  quickFilters?: QuickFilterState;
  channels: Channel[];
  channelMatchMode: ChannelMatchMode;
  /**
   * Narrows the candidate list. Pass a type guard and parameterize the hook
   * (e.g. `useTaskViewFiltering<TaskPost>(...)`) to get a properly narrowed
   * result without a follow-up refilter.
   */
  taskPredicate?: (task: Post) => boolean;
}

export function useTaskViewFiltering<T extends Post = Post>({
  posts,
  focusedTaskId,
  includeFocusedTask = false,
  hideClosedTasks = false,
  searchQuery,
  people,
  selectedPubkeys,
  quickFilters,
  channels,
  channelMatchMode,
  taskPredicate,
}: UseTaskViewFilteringParams<T>): T[] {
  const filterIndex = useMemo(
    () => buildTaskViewFilterIndex(posts, people),
    [posts, people]
  );
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const prefilteredTaskIds = useMemo(() => new Set(posts.map((task) => task.id)), [posts]);
  const request = useMemo<TaskViewFilterRequest>(
    () => ({
      source: {
        allTasks: posts,
        filterIndex,
        prefilteredTaskIds,
        people,
        selectedPubkeys,
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
      posts,
      channelMatchMode,
      excluded,
      filterIndex,
      focusedTaskId,
      hideClosedTasks,
      includeFocusedTask,
      included,
      people,
      selectedPubkeys,
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
