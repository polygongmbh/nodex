import { useMemo } from "react";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { collectEventDayKeys, postHasDateOnDay } from "@/domain/content/post-day-matching";
import { resolveStatusPeopleScope, selectPeopleOwnedTasks } from "@/components/tasks/status/status-filters";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import { useHomeDayStore } from "@/features/feed-page/stores/home-day-store";
import type { Post, TaskDate } from "@/types";

interface HomeViewStateInput {
  posts: Post[];
  focusedTaskId: string | null;
}

export interface HomeViewState {
  /** Sidebar-scoped tasks for the my-tasks panel, narrowed to the selected day's referenced dates. */
  myTasksContextTasks: Post[];
  /** People whose owned tasks the my-tasks panel shows (sidebar selection, else the signed-in user). */
  myTasksPeopleScope: Set<string>;
  /** True when a day is selected and the people scope owns no task dated that day. */
  isMyTasksEmptyForSelectedDay: boolean;
  /** Days carrying referenced dates within the current context — the mini calendar's dots. */
  eventDayKeys: Set<string>;
  selectedDayKey: string | null;
  toggleSelectedDay: (dayKey: string) => void;
  /** Primary date pre-filled into composers while a day is selected. */
  composerDefaultDates: TaskDate[] | undefined;
}

/**
 * Derived state of the home view's right-hand column (my tasks + mini
 * calendar). The timeline panel is not represented here: FeedView pulls its
 * own home scope via useFeedViewState({ scope: "home" }).
 */
export function useHomeViewState({ posts, focusedTaskId }: HomeViewStateInput): HomeViewState {
  const currentUser = useCurrentUser();
  const { channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const selectedDayKey = useHomeDayStore((s) => s.selectedDayKey);
  const toggleSelectedDay = useHomeDayStore((s) => s.toggleSelectedDay);

  const filterIndex = useMemo(() => buildTaskViewFilterIndex(posts, people), [posts, people]);
  const prefilteredTaskIds = useMemo(() => new Set(posts.map((task) => task.id)), [posts]);
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const contextTasks = useMemo(
    () =>
      filterTasksForView({
        source: { allTasks: posts, filterIndex, prefilteredTaskIds, people, selectedPubkeys },
        scope: { focusedTaskId, hideClosedTasks: false },
        criteria: {
          searchQuery,
          quickFilters,
          channels: { included, excluded, matchMode: channelMatchMode },
        },
      }),
    [
      excluded,
      included,
      posts,
      channelMatchMode,
      filterIndex,
      focusedTaskId,
      people,
      selectedPubkeys,
      prefilteredTaskIds,
      quickFilters,
      searchQuery,
    ]
  );

  const myTasksPeopleScope = useMemo(
    () =>
      resolveStatusPeopleScope(
        Array.from(selectedPubkeys),
        currentUser?.pubkey
      ),
    [selectedPubkeys, currentUser?.pubkey]
  );

  const myTasksContextTasks = useMemo(
    () =>
      selectedDayKey
        ? contextTasks.filter((task) => postHasDateOnDay(task, selectedDayKey))
        : contextTasks,
    [contextTasks, selectedDayKey]
  );

  const isMyTasksEmptyForSelectedDay = useMemo(
    () =>
      selectedDayKey !== null &&
      myTasksPeopleScope.size > 0 &&
      selectPeopleOwnedTasks({
        contextTasks: myTasksContextTasks,
        peopleScope: myTasksPeopleScope,
        focusedTaskId,
      }).length === 0,
    [focusedTaskId, myTasksContextTasks, myTasksPeopleScope, selectedDayKey]
  );

  const eventDayKeys = useMemo(() => collectEventDayKeys(contextTasks), [contextTasks]);

  const composerDefaultDates = useMemo<TaskDate[] | undefined>(
    () => (selectedDayKey ? [{ date: selectedDayKey, type: "due" }] : undefined),
    [selectedDayKey]
  );

  return {
    myTasksContextTasks,
    myTasksPeopleScope,
    isMyTasksEmptyForSelectedDay,
    eventDayKeys,
    selectedDayKey,
    toggleSelectedDay,
    composerDefaultDates,
  };
}
