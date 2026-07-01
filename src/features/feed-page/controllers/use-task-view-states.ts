import { useCallback, useDeferredValue, useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/domain/content/channel-filtering";
import { filterTasksByDepthMode } from "@/domain/content/depth-mode-filter";
import { taskMatchesSelectedPeople } from "@/domain/content/person-filter";
import {
  buildTaskViewFilterIndex,
  filterTasksForView,
  getDirectMatchTaskIdsForView,
  type TaskViewFilterRequest,
} from "@/domain/content/task-view-filtering";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { isTaskTerminal } from "@/domain/content/task-state";
import { getTaskLocalDate } from "@/lib/task-dates";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { normalizeQuickFilterState, taskMatchesQuickFilters } from "@/domain/content/quick-filter-constraints";
import { resolveMobileFallbackNoticeType } from "@/domain/content/mobile-fallback-notice";
import { buildUserInvolvementIndex, makeHomeTimelinePredicate } from "@/domain/content/user-involvement";
import { formatDayKey, postOccursOnDay } from "@/domain/content/post-day-matching";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import { useHomeDayStore } from "@/features/feed-page/stores/home-day-store";
import { resolvePostsByIdFor } from "@/features/feed-page/stores/posts-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEmptyScopeModel } from "./use-empty-scope-model";
import { useTaskViewFiltering } from "./use-task-view-filtering";
import { sortByLatestModified } from "@/lib/kanban-sorting";
import type { DisplayDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
import type { EmptyScopeModel } from "@/lib/empty-scope";
import {
  getTaskStatus,
  isCalendarEntryPost,
  isTaskPost,
  getPostDateEntries,
  type CalendarEntryPost as TypesCalendarEntryPost,
  type Channel,
  type ChannelMatchMode,
  type Relay,
  type Post,
  type TaskPost,
  type TaskStateUpdate,
  type TaskStatus,
  getTaskState,
  getTaskPrimaryDate,
  getTaskStateUpdates,
} from "@/types";
import type { Person } from "@/types/person";
import type { MobileViewType } from "@/components/mobile/MobileNav";

interface BaseViewStateInput {
  posts: Post[];
  focusedTaskId: string | null;
}

// Views that scope their content can opt into the mobile search-omission
// fallback by declaring which mobile view they represent.
interface ScopedViewStateInput extends BaseViewStateInput {
  currentView?: MobileViewType;
}

interface MobileScopedViewStateInput extends BaseViewStateInput {
  currentView: MobileViewType;
  showFilters: boolean;
  isHydrating?: boolean;
}



export interface FeedEntry {
  type: "task" | "state-update";
  id: string;
  timestamp: Date;
  task: Post;
  update?: TaskStateUpdate;
}

/**
 * Which baseline scope the feed renders. "home" applies the home view's
 * default restriction and day filter, both derived here from the relevant
 * stores (current user, home day selection) rather than threaded by callers.
 */
export type FeedScope = "default" | "home";

export interface FeedViewState {
  feedTasks: Post[];
  allFeedEntries: FeedEntry[];
  feedEntries: FeedEntry[];
  activeFeedEntries: FeedEntry[];
  mediaPreviewTasks: Post[];
  shouldShowMobileScopeFallback: boolean;
  shouldShowInlineEmptyHint: boolean;
  shouldShowScopeFooterHint: boolean;
  shouldShowScreenEmptyState: boolean;
}

export interface ListViewState {
  filteredTaskCandidates: TaskPost[];
  baseListTaskCandidates: TaskPost[];
  hasActiveFilters: boolean;
  hasSelectedScope: boolean;
}

export interface KanbanViewState {
  kanbanTasks: TaskPost[];
  orderedKanbanTasks: TaskPost[];
  tasksByStatus: Record<TaskStatus, TaskPost[]>;
  getAncestorChain: (taskId: string) => { id: string; text: string }[];
  showContext: boolean;
}

export interface TaskViewSource {
  posts: Post[];
  focusedTaskId: string | null;
  searchQuery: string;
  deferredSearchQuery: string;
  relays: Relay[];
  activeRelays: Relay[];
  channels: Channel[];
  neutralChannels: Channel[];
  people: Person[];
  selectedPubkeys: Set<string>;
  quickFilters: ReturnType<typeof useFeedSurfaceState>["quickFilters"];
  channelMatchMode: ChannelMatchMode;
  taskById: ReadonlyMap<string, Post>;
  childrenMap: Map<string | undefined, Post[]>;
  prefilteredTaskIds: Set<string>;
  filterIndex: ReturnType<typeof buildTaskViewFilterIndex>;
  sortContext: SortContext;
  scopeModel: EmptyScopeModel;
}

type TreeSelectorSource = Pick<
  TaskViewSource,
  | "posts"
  | "focusedTaskId"
  | "deferredSearchQuery"
  | "channels"
  | "people"
  | "selectedPubkeys"
  | "quickFilters"
  | "channelMatchMode"
  | "taskById"
  | "childrenMap"
  | "prefilteredTaskIds"
  | "filterIndex"
  | "sortContext"
  | "scopeModel"
>;

export type CalendarEntryPost = TypesCalendarEntryPost;

export interface CalendarSelectors {
  getTasksWithDueDates(): CalendarEntryPost[];
  getUpcomingTasks(): CalendarEntryPost[];
  getTasksForDay(day: Date): CalendarEntryPost[];
  getAncestorChain(taskId: string): { id: string; text: string }[];
}

export interface TreeSelectors {
  hasMatchingFilters(): boolean;
  getCurrentContextTask(): Post | null;
  getVisibleTasks(): Post[];
  getDisplayedTasks(options?: { useMobileFallback?: boolean }): Post[];
  getMatchingChildren(parentId: string): Post[];
  isDirectMatch(taskId: string): boolean;
  getEmptyStateFlags(options?: { isMobile?: boolean }): {
    shouldShowMobileScopeFallback: boolean;
    shouldShowInlineEmptyHint: boolean;
    shouldShowScopeFooterHint: boolean;
    shouldShowScreenEmptyState: boolean;
  };
}

interface TreeVisibilitySource {
  focusedTaskId: string | null;
  prefilteredTaskIds: Set<string>;
  sortContext: SortContext;
}

export interface TreeVisibilityState {
  directlyMatchingIds: Set<string>;
  matchingVisibleIds: Set<string>;
  baseVisibleTasks: Post[];
  visibleTasks: Post[];
}

export interface MobileFallbackNoticeState {
  mobileFallbackMessage: string | null;
  shouldShowMobileFallbackNotice: boolean;
}

export function sortKanbanColumnTasks(tasks: TaskPost[], status: TaskStatus, sortContext: SortContext): TaskPost[] {
  return isTaskTerminal(status) ? sortByLatestModified(tasks) : sortTasks(tasks, sortContext);
}

// Stable identity for the person-unscoped ("neutral") filter variants, so the
// useTaskViewFiltering memo isn't busted by a fresh Set each render.
const EMPTY_PUBKEY_SET: Set<string> = new Set();

function buildFeedEntries(tasks: Post[], focusedTaskId: string | null): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const task of [...tasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())) {
    if (getTaskStatus(getTaskState(task)) !== "closed" || task.id === focusedTaskId) {
      entries.push({ type: "task", id: task.id, timestamp: task.timestamp, task });
    }
    for (const update of getTaskStateUpdates(task) || []) {
      entries.push({
        type: "state-update",
        id: `${task.id}-state-${update.id}`,
        timestamp: update.timestamp,
        task,
        update,
      });
    }
  }
  return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

interface MobileViewScopeMatches {
  hasSearchQuery: boolean;
  hasScopedMatchesWithSearch: boolean;
  hasScopedMatchesWithoutSearch: boolean;
  hasSourceContent: boolean;
  effectiveSearchQuery: string;
}

// On mobile, when a typed search produces no results inside the active scope
// but the same scope without the search does, we drop the search so the user
// still sees their scoped content (a notice explains why). This resolves that
// "effective" query from the filter store directly — no prop is threaded
// through the view tree. Desktop and the unscoped status view keep the raw
// query. The filter index is WeakMap-cached per (posts, people), so computing
// the match probes here is shared with each view's useTaskViewSource.
function useMobileViewScopeMatches({
  posts,
  focusedTaskId,
  currentView,
}: ScopedViewStateInput): MobileViewScopeMatches {
  const isMobile = useIsMobile();
  const { channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const hasSearchQuery = searchQuery.trim().length > 0;

  const matches = useMemo(() => {
    if (!isMobile || !currentView) {
      return null;
    }
    const prefilteredTaskIds = new Set(posts.map((task) => task.id));
    const filterIndex = buildTaskViewFilterIndex(posts, people);
    const { included, excluded } = getIncludedExcludedChannelNames(channels);
    const taskPredicate =
      currentView === "list" || currentView === "calendar"
        ? (task: Post) =>
            isTaskPost(task) && Boolean(getTaskPrimaryDate(task)) && !isTaskTerminal(getTaskState(task))
        : undefined;
    const includeFocusedTask = currentView === "feed";
    const hideClosedTasks = currentView === "feed";
    type MatchVariant = "scopedWithSearch" | "scopedWithoutSearch" | "sourceWithoutScope";
    const hasMatches = (variant: MatchVariant): boolean => {
      const useScopedFilters = variant !== "sourceWithoutScope";
      const effectiveSelectedPubkeys = variant === "sourceWithoutScope" ? new Set<string>() : selectedPubkeys;
      const variantSearchQuery = variant === "scopedWithSearch" ? searchQuery : "";
      return (
        getDirectMatchTaskIdsForView({
          source: { allTasks: posts, filterIndex, prefilteredTaskIds, people, selectedPubkeys: effectiveSelectedPubkeys },
          scope: { focusedTaskId, includeFocusedTask, hideClosedTasks, taskPredicate },
          criteria: {
            searchQuery: variantSearchQuery,
            quickFilters,
            channels: {
              included: useScopedFilters ? included : [],
              excluded: useScopedFilters ? excluded : [],
              matchMode: channelMatchMode,
            },
          },
        }).size > 0
      );
    };
    return {
      hasScopedMatchesWithSearch: hasMatches("scopedWithSearch"),
      hasScopedMatchesWithoutSearch: hasMatches("scopedWithoutSearch"),
      hasSourceContent: hasMatches("sourceWithoutScope"),
    };
  }, [isMobile, currentView, posts, people, selectedPubkeys, channels, quickFilters, channelMatchMode, searchQuery, focusedTaskId]);

  const hasScopedMatchesWithSearch = matches?.hasScopedMatchesWithSearch ?? false;
  const hasScopedMatchesWithoutSearch = matches?.hasScopedMatchesWithoutSearch ?? false;
  const hasSourceContent = matches?.hasSourceContent ?? false;
  const shouldOmitSearchQuery =
    matches !== null && hasSearchQuery && !hasScopedMatchesWithSearch && hasScopedMatchesWithoutSearch;

  return {
    hasSearchQuery,
    hasScopedMatchesWithSearch,
    hasScopedMatchesWithoutSearch,
    hasSourceContent,
    effectiveSearchQuery: shouldOmitSearchQuery ? "" : searchQuery,
  };
}

export function useTaskViewSource({
  posts,
  focusedTaskId,
  currentView,
}: ScopedViewStateInput): TaskViewSource {
  const isMobile = useIsMobile();
  const { relays, channels, people, quickFilters } = useFeedSurfaceState();
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const { effectiveSearchQuery } = useMobileViewScopeMatches({ posts, focusedTaskId, currentView });
  // The calendar has no search affordance on mobile, so it always ignores the
  // typed query there rather than applying the omission fallback.
  const searchQuery = isMobile && currentView === "calendar" ? "" : effectiveSearchQuery;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const taskById = resolvePostsByIdFor(posts);
  const childrenMap = useMemo(() => buildChildrenMap(posts), [posts]);
  const priorityScores = useMemo(() => evaluateTaskPriorities(posts), [posts]);
  const prefilteredTaskIds = useMemo(() => new Set(posts.map((task) => task.id)), [posts]);
  const filterIndex = useMemo(() => buildTaskViewFilterIndex(posts, people), [posts, people]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap, allTasks: posts, taskById, priorityScores }),
    [posts, childrenMap, priorityScores, taskById]
  );
  const neutralChannels = useMemo(
    () => channels.map((channel) => ({ ...channel, filterState: "neutral" as const })),
    [channels]
  );
  const activeRelays = useMemo(() => relays.filter((relay) => relay.isActive), [relays]);
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
    searchQuery: deferredSearchQuery,
    focusedTaskId,
    taskById,
  });

  return {
    posts,
    focusedTaskId,
    searchQuery,
    deferredSearchQuery,
    relays,
    activeRelays,
    channels,
    neutralChannels,
    people,
    selectedPubkeys,
    quickFilters,
    channelMatchMode,
    taskById,
    childrenMap,
    prefilteredTaskIds,
    filterIndex,
    sortContext,
    scopeModel,
  };
}

export function getAncestorChainFromSource(
  source: Pick<TaskViewSource, "taskById">,
  taskId: string,
  relativeToTaskId?: string | null
): { id: string; text: string }[] {
  if (relativeToTaskId && taskId === relativeToTaskId) {
    return [];
  }

  const chain: { id: string; text: string }[] = [];
  let current = source.taskById.get(taskId);
  const visited = new Set<string>();

  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = source.taskById.get(current.parentId);
    if (!parent) break;
    if (relativeToTaskId && parent.id === relativeToTaskId) {
      return chain;
    }
    chain.unshift({ id: parent.id, text: formatBreadcrumbLabel(parent.content) });
    current = parent;
  }

  return chain;
}

export function createCalendarSelectors(source: TaskViewSource): CalendarSelectors {
  let tasksWithDueDatesCache: CalendarEntryPost[] | null = null;
  let tasksByDayCache: Map<string, CalendarEntryPost[]> | null = null;
  let upcomingTasksCache: CalendarEntryPost[] | null = null;
  const { included, excluded } = getIncludedExcludedChannelNames(source.channels);

  const getTasksWithDueDates = () => {
    if (tasksWithDueDatesCache) return tasksWithDueDatesCache;
    const request: TaskViewFilterRequest = {
      source: {
        allTasks: source.posts,
        filterIndex: source.filterIndex,
        prefilteredTaskIds: source.prefilteredTaskIds,
        people: source.people,
        selectedPubkeys: source.selectedPubkeys,
      },
      scope: {
        focusedTaskId: source.focusedTaskId,
        hideClosedTasks: true,
        taskPredicate: (task) => isCalendarEntryPost(task) && Boolean(getTaskPrimaryDate(task)),
      },
      criteria: {
        searchQuery: source.searchQuery,
        quickFilters: source.quickFilters,
        channels: {
          included,
          excluded,
          matchMode: source.channelMatchMode,
        },
      },
    };
    tasksWithDueDatesCache = filterTasksForView(request).filter(
      (task): task is CalendarEntryPost => isCalendarEntryPost(task) && Boolean(getTaskPrimaryDate(task))
    );
    return tasksWithDueDatesCache;
  };

  const getTasksByDay = () => {
    if (tasksByDayCache) return tasksByDayCache;
    const byDay = new Map<string, Set<CalendarEntryPost>>();
    const addToDay = (day: Date, task: CalendarEntryPost) => {
      const dayKey = format(startOfDay(day), "yyyy-MM-dd");
      const bucket = byDay.get(dayKey);
      if (bucket) {
        bucket.add(task);
      } else {
        byDay.set(dayKey, new Set([task]));
      }
    };
    for (const task of getTasksWithDueDates()) {
      const entries = getPostDateEntries(task);
      const startEntry = entries.find((d) => d.type === "start");
      const endEntry = entries.find((d) => d.type === "end");
      const start = startEntry ? getTaskLocalDate(startEntry) : undefined;
      const end = endEntry ? getTaskLocalDate(endEntry) : undefined;
      const rangeStart = start && end ? startOfDay(start <= end ? start : end) : null;
      const rangeEnd = start && end ? startOfDay(start <= end ? end : start) : null;
      if (rangeStart && rangeEnd) {
        for (let cursor = rangeStart; cursor.getTime() <= rangeEnd.getTime(); cursor = addDays(cursor, 1)) {
          addToDay(cursor, task);
        }
      }
      for (const entry of entries) {
        if (rangeStart && (entry.type === "start" || entry.type === "end")) continue;
        const entryDate = getTaskLocalDate(entry);
        if (entryDate) addToDay(entryDate, task);
      }
    }
    const result = new Map<string, CalendarEntryPost[]>();
    for (const [dayKey, dayTasks] of byDay.entries()) {
      result.set(dayKey, sortTasks(Array.from(dayTasks), source.sortContext) as CalendarEntryPost[]);
    }
    tasksByDayCache = result;
    return tasksByDayCache;
  };

  return {
    getTasksWithDueDates,
    getUpcomingTasks() {
      if (upcomingTasksCache) return upcomingTasksCache;
      upcomingTasksCache = sortTasks(
        getTasksWithDueDates().filter((task) => !isTaskTerminal(getTaskState(task))),
        source.sortContext
      );
      return upcomingTasksCache;
    },
    getTasksForDay(day: Date) {
      return getTasksByDay().get(format(startOfDay(day), "yyyy-MM-dd")) || [];
    },
    getAncestorChain(taskId: string) {
      return getAncestorChainFromSource(source, taskId, source.focusedTaskId);
    },
  };
}

export function createTreeSelectors(source: TreeSelectorSource): TreeSelectors {
  let visibilityCache:
    | {
        hasMatchingFilters: boolean;
        state: TreeVisibilityState;
      }
    | null = null;

  const getVisibility = () => {
    if (visibilityCache) return visibilityCache;
    const { included, excluded } = getIncludedExcludedChannelNames(source.channels);
    const hasSelectedPeople = source.selectedPubkeys.size > 0;
    const hasMatchingFilters =
      source.deferredSearchQuery.trim().length > 0 ||
      included.length > 0 ||
      excluded.length > 0 ||
      hasSelectedPeople;

    if (hasMatchingFilters) {
      const directlyMatchingIds = getDirectMatchTaskIdsForView({
        source: {
          allTasks: source.posts,
          filterIndex: source.filterIndex,
          prefilteredTaskIds: source.prefilteredTaskIds,
          people: source.people,
          selectedPubkeys: source.selectedPubkeys,
        },
        scope: {
          focusedTaskId: source.focusedTaskId,
        },
        criteria: {
          searchQuery: source.deferredSearchQuery,
          quickFilters: source.quickFilters,
          channels: {
            included,
            excluded,
            matchMode: source.channelMatchMode,
          },
        },
      });
      visibilityCache = {
        hasMatchingFilters,
        state: buildTreeVisibilityState({
          focusedTaskId: source.focusedTaskId,
          prefilteredTaskIds: source.prefilteredTaskIds,
          sortContext: source.sortContext,
          directlyMatchingIds,
        }),
      };
      return visibilityCache;
    }

    visibilityCache = {
      hasMatchingFilters,
      state: buildTreeVisibilityState({
        focusedTaskId: source.focusedTaskId,
        prefilteredTaskIds: source.prefilteredTaskIds,
        sortContext: source.sortContext,
        directlyMatchingIds: new Set<string>(),
      }),
    };
    return visibilityCache;
  };

  return {
    hasMatchingFilters() {
      return getVisibility().hasMatchingFilters;
    },
    getCurrentContextTask() {
      return source.focusedTaskId ? source.taskById.get(source.focusedTaskId) || null : null;
    },
    getVisibleTasks() {
      return getVisibility().state.visibleTasks;
    },
    getDisplayedTasks(options = {}) {
      const visibility = getVisibility();
      const shouldUseFallback =
        Boolean(options.useMobileFallback) &&
        source.scopeModel.hasActiveFilters &&
        visibility.state.visibleTasks.length === 0 &&
        visibility.state.baseVisibleTasks.length > 0;
      return shouldUseFallback ? visibility.state.baseVisibleTasks : visibility.state.visibleTasks;
    },
    getMatchingChildren(parentId: string) {
      let children = source.childrenMap.get(parentId) || [];
      children = children.filter((child) => source.prefilteredTaskIds.has(child.id));
      if (getVisibility().hasMatchingFilters) {
        children = children.filter((child) => getVisibility().state.matchingVisibleIds.has(child.id));
      }
      return sortTasks(children, source.sortContext);
    },
    isDirectMatch(taskId: string) {
      const visibility = getVisibility();
      if (!visibility.hasMatchingFilters) return true;
      return visibility.state.directlyMatchingIds.has(taskId);
    },
    getEmptyStateFlags(options = {}) {
      const visibility = getVisibility();
      const shouldShowMobileScopeFallback =
        Boolean(options.isMobile) &&
        source.scopeModel.hasActiveFilters &&
        visibility.state.visibleTasks.length === 0 &&
        visibility.state.baseVisibleTasks.length > 0;
      const shouldShowInlineEmptyHint =
        !options.isMobile &&
        source.scopeModel.hasActiveFilters &&
        visibility.state.visibleTasks.length === 0 &&
        visibility.state.baseVisibleTasks.length > 0;
      return {
        shouldShowMobileScopeFallback,
        shouldShowInlineEmptyHint,
        shouldShowScopeFooterHint:
          !options.isMobile && source.scopeModel.hasSelectedScope && visibility.state.visibleTasks.length > 0,
        shouldShowScreenEmptyState:
          visibility.state.visibleTasks.length === 0 &&
          !shouldShowMobileScopeFallback &&
          !shouldShowInlineEmptyHint,
      };
    },
  };
}

export function buildTreeVisibilityState({
  focusedTaskId,
  prefilteredTaskIds,
  sortContext,
  directlyMatchingIds,
}: TreeVisibilitySource & {
  directlyMatchingIds: Set<string>;
}): TreeVisibilityState {
  const taskById = sortContext.taskById ?? resolvePostsByIdFor(sortContext.allTasks);
  const { childrenMap } = sortContext;
  const matchingVisibleIds = new Set<string>();

  for (const taskId of directlyMatchingIds) {
    matchingVisibleIds.add(taskId);
    let current = taskById.get(taskId);
    while (current?.parentId) {
      matchingVisibleIds.add(current.parentId);
      current = taskById.get(current.parentId);
    }
  }

  let rootTasks: Post[];
  if (focusedTaskId) {
    rootTasks = childrenMap.get(focusedTaskId) || [];
  } else {
    rootTasks = (childrenMap.get(undefined) || []).filter((task) => isTaskPost(task));
  }
  rootTasks = rootTasks.filter((task) => prefilteredTaskIds.has(task.id));
  const baseVisibleTasks = sortTasks(rootTasks, sortContext);
  const visibleTasks = directlyMatchingIds.size > 0
    ? baseVisibleTasks.filter((task) => matchingVisibleIds.has(task.id))
    : baseVisibleTasks;

  return {
    directlyMatchingIds,
    matchingVisibleIds,
    baseVisibleTasks,
    visibleTasks,
  };
}

export function useFeedViewState({
  posts,
  focusedTaskId,
  isMobile = false,
  scope = "default",
}: BaseViewStateInput & {
  isMobile?: boolean;
  scope?: FeedScope;
}): FeedViewState {
  const { relays, channels, people, quickFilters } = useFeedSurfaceState();
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const currentUser = useCurrentUser();
  const homeSelectedDayKey = useHomeDayStore((s) => s.selectedDayKey);
  const isHomeScope = scope === "home";
  const hasSidebarScopeFilters = useMemo(
    () =>
      channels.some((channel) => channel.filterState !== "neutral") ||
      selectedPubkeys.size > 0,
    [channels, selectedPubkeys]
  );
  // On mobile, the Home chip narrows top-level activity to the user's pinned
  // channels; desktop Home keeps showing all top-level activity (empty set).
  const pinnedChannelTags = useMemo(() => {
    if (!isHomeScope || !isMobile) return undefined;
    return new Set(
      channels
        .filter((channel) => channel.pinIndex !== undefined)
        .map((channel) => channel.name.toLowerCase())
    );
  }, [channels, isHomeScope, isMobile]);
  // Baseline post-level scope of the home timeline: top-level activity (narrowed
  // to pinned channels on mobile) plus anything involving the signed-in user.
  // Part of what the home view *is* (hence also applied to the unfiltered
  // fallback variants below) — and lifted entirely as soon as any sidebar
  // channel/person filter is active.
  const taskPredicate = useMemo(() => {
    if (!isHomeScope || hasSidebarScopeFilters) return undefined;
    const involvedIds = buildUserInvolvementIndex(posts, currentUser?.pubkey);
    return makeHomeTimelinePredicate({ focusedTaskId, involvedIds, pinnedChannelTags });
  }, [currentUser?.pubkey, focusedTaskId, hasSidebarScopeFilters, isHomeScope, pinnedChannelTags, posts]);
  // Entry-level day restriction: unlike taskPredicate this distinguishes a
  // task's own card from its state updates (each entry carries its own
  // timestamp), so a day shows exactly that day's activity — posts created
  // or dated that day plus state updates made that day.
  const entryPredicate = useMemo(() => {
    if (!isHomeScope || !homeSelectedDayKey) return undefined;
    return (entry: FeedEntry) =>
      entry.type === "state-update"
        ? formatDayKey(entry.timestamp) === homeSelectedDayKey
        : postOccursOnDay(entry.task, homeSelectedDayKey);
  }, [homeSelectedDayKey, isHomeScope]);
  const { effectiveSearchQuery: searchQuery } = useMobileViewScopeMatches({
    posts,
    focusedTaskId,
    currentView: "feed",
  });
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredChannels = useDeferredValue(channels);
  const deferredChannelMatchMode = useDeferredValue(channelMatchMode);
  const filteredFeedTasks = useTaskViewFiltering({
    posts,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: deferredSearchQuery,
    people,
    selectedPubkeys,
    quickFilters,
    channels: deferredChannels,
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate,
  });
  const neutralChannels = useMemo(
    () => deferredChannels.map((channel) => ({ ...channel, filterState: "neutral" as const })),
    [deferredChannels]
  );
  const unfilteredFeedTasks = useTaskViewFiltering({
    posts,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: "",
    people,
    selectedPubkeys: EMPTY_PUBKEY_SET,
    quickFilters,
    channels: neutralChannels,
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate,
  });
  const filteredFeedTasksWithClosed = useTaskViewFiltering({
    posts,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: false,
    searchQuery: deferredSearchQuery,
    people,
    selectedPubkeys,
    quickFilters,
    channels: deferredChannels,
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate,
  });
  const unfilteredFeedTasksWithClosed = useTaskViewFiltering({
    posts,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: false,
    searchQuery: "",
    people,
    selectedPubkeys: EMPTY_PUBKEY_SET,
    quickFilters,
    channels: neutralChannels,
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate,
  });
  const feedTasks = useMemo(() => {
    const sorted = [...filteredFeedTasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (!entryPredicate) return sorted;
    // Keep keyboard navigation aligned with the entries actually displayed.
    return sorted.filter((task) =>
      entryPredicate({ type: "task", id: task.id, timestamp: task.timestamp, task })
    );
  }, [entryPredicate, filteredFeedTasks]);
  const allFeedEntries = useMemo(() => {
    const entries = buildFeedEntries(unfilteredFeedTasksWithClosed, focusedTaskId);
    return entryPredicate ? entries.filter(entryPredicate) : entries;
  }, [entryPredicate, focusedTaskId, unfilteredFeedTasksWithClosed]);
  const feedEntries = useMemo(() => {
    const entries = buildFeedEntries(filteredFeedTasksWithClosed, focusedTaskId);
    return entryPredicate ? entries.filter(entryPredicate) : entries;
  }, [entryPredicate, filteredFeedTasksWithClosed, focusedTaskId]);
  const taskById = resolvePostsByIdFor(posts);
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
    searchQuery: deferredSearchQuery,
    focusedTaskId,
    taskById,
  });
  const hasSourceFeedContent = allFeedEntries.length > 0;
  const shouldShowMobileScopeFallback =
    isMobile && scopeModel.hasActiveFilters && feedEntries.length === 0 && hasSourceFeedContent;
  const shouldShowInlineEmptyHint =
    !isMobile && scopeModel.hasActiveFilters && feedEntries.length === 0 && hasSourceFeedContent;
  const shouldShowScreenEmptyState =
    feedEntries.length === 0 &&
    !shouldShowMobileScopeFallback &&
    !shouldShowInlineEmptyHint;
  const activeFeedEntries = shouldShowMobileScopeFallback ? allFeedEntries : feedEntries;
  return {
    feedTasks,
    allFeedEntries,
    feedEntries,
    activeFeedEntries,
    mediaPreviewTasks: shouldShowMobileScopeFallback ? unfilteredFeedTasks : feedTasks,
    shouldShowMobileScopeFallback,
    shouldShowInlineEmptyHint,
    shouldShowScopeFooterHint: !isMobile && scopeModel.hasSelectedScope && feedEntries.length > 0,
    shouldShowScreenEmptyState,
  };
}

export function useListViewState({
  posts,
  focusedTaskId,
  depthMode = "leaves",
}: BaseViewStateInput & { depthMode?: DisplayDepthMode }): ListViewState {
  const { relays, channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const deferredChannels = useDeferredValue(channels);
  const deferredChannelMatchMode = useDeferredValue(channelMatchMode);
  const filteredTaskCandidates = useTaskViewFiltering<TaskPost>({
    posts,
    focusedTaskId,
    searchQuery,
    people,
    selectedPubkeys,
    quickFilters,
    channels: deferredChannels,
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate: isTaskPost,
  });
  const baseListTaskCandidates = useTaskViewFiltering<TaskPost>({
    posts,
    focusedTaskId,
    searchQuery: "",
    people,
    selectedPubkeys,
    quickFilters,
    channels: deferredChannels.map((channel) => ({ ...channel, filterState: "neutral" as const })),
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate: isTaskPost,
  });
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
    searchQuery,
    focusedTaskId,
    allTasks: posts,
  });
  return {
    filteredTaskCandidates,
    baseListTaskCandidates,
    hasActiveFilters: scopeModel.hasActiveFilters,
    hasSelectedScope: scopeModel.hasSelectedScope,
  };
}

export function useKanbanViewState({
  posts,
  focusedTaskId,
  depthMode,
}: BaseViewStateInput & { depthMode: DisplayDepthMode }): KanbanViewState {
  const { channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const deferredChannels = useDeferredValue(channels);
  const deferredChannelMatchMode = useDeferredValue(channelMatchMode);
  const childrenMap = useMemo(() => buildChildrenMap(posts), [posts]);
  const taskById = resolvePostsByIdFor(posts);
  const priorityScores = useMemo(() => evaluateTaskPriorities(posts), [posts]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap, allTasks: posts, taskById, priorityScores }),
    [posts, childrenMap, priorityScores, taskById]
  );
  const hasChildren = useCallback(
    (taskId: string): boolean => (childrenMap.get(taskId) || []).some((candidate) => isTaskPost(candidate)),
    [childrenMap]
  );
  const getDepth = useCallback(
    (taskId: string): number => {
      const task = taskById.get(taskId);
      if (!task?.parentId) return 1;
      return 1 + getDepth(task.parentId);
    },
    [taskById]
  );
  const getAncestorChain = useCallback(
    (taskId: string): { id: string; text: string }[] => {
      return getAncestorChainFromSource({ taskById }, taskId, focusedTaskId);
    },
    [focusedTaskId, taskById]
  );
  const filteredTaskCandidates = useTaskViewFiltering<TaskPost>({
    posts,
    focusedTaskId,
    searchQuery,
    people,
    selectedPubkeys,
    quickFilters,
    channels: deferredChannels,
    channelMatchMode: deferredChannelMatchMode,
    taskPredicate: isTaskPost,
  });
  const kanbanTasks = useMemo<TaskPost[]>(
    () => filterTasksByDepthMode({ tasks: filteredTaskCandidates, depthMode, focusedTaskId, getDepth, hasChildren }),
    [depthMode, filteredTaskCandidates, focusedTaskId, getDepth, hasChildren]
  );
  const tasksByStatus = useMemo<Record<TaskStatus, TaskPost[]>>(() => {
    const grouped: Record<TaskStatus, TaskPost[]> = { open: [], active: [], done: [], closed: [] };
    kanbanTasks.forEach((task) => {
      grouped[getTaskStatus(getTaskState(task))].push(task);
    });
    grouped.open = sortKanbanColumnTasks(grouped.open, "open", sortContext);
    grouped.active = sortKanbanColumnTasks(grouped.active, "active", sortContext);
    grouped.done = sortKanbanColumnTasks(grouped.done, "done", sortContext);
    grouped.closed = sortKanbanColumnTasks(grouped.closed, "closed", sortContext);
    return grouped;
  }, [kanbanTasks, sortContext]);
  return {
    kanbanTasks,
    orderedKanbanTasks: [...tasksByStatus.open, ...tasksByStatus.active, ...tasksByStatus.done, ...tasksByStatus.closed],
    tasksByStatus,
    getAncestorChain,
    showContext: depthMode !== "1",
  };
}

export function useMobileFallbackNoticeState({
  posts,
  focusedTaskId,
  currentView,
  showFilters,
  isHydrating = false,
}: MobileScopedViewStateInput): MobileFallbackNoticeState {
  const { t } = useTranslation("tasks");
  const { relays, channels, people, quickFilters } = useFeedSurfaceState();
  const taskById = resolvePostsByIdFor(posts);
  const {
    hasSearchQuery,
    hasScopedMatchesWithSearch,
    hasScopedMatchesWithoutSearch,
    hasSourceContent,
  } = useMobileViewScopeMatches({ posts, focusedTaskId, currentView });
  const scopeModelWithoutQuickSearch = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
    searchQuery: "",
    focusedTaskId,
    taskById,
  });
  const quickFilterFallbackMessage = scopeModelWithoutQuickSearch.scopeDescription
    ? t("tasks.empty.mobileQuickFilterFallbackScoped", {
        scope: scopeModelWithoutQuickSearch.scopeDescription,
      })
    : t("tasks.empty.mobileQuickFilterFallback");
  const mobileFallbackNoticeType = resolveMobileFallbackNoticeType({
    hasSourceContent,
    hasScopeFilters: scopeModelWithoutQuickSearch.hasActiveFilters,
    hasScopedMatchesWithSearch,
    hasScopedMatchesWithoutSearch,
    hasSearchQuery,
  });
  const mobileFallbackMessage =
    mobileFallbackNoticeType === "scope"
      ? scopeModelWithoutQuickSearch.mobileFallbackHint
      : mobileFallbackNoticeType === "quick"
        ? quickFilterFallbackMessage
        : null;
  return {
    mobileFallbackMessage,
    shouldShowMobileFallbackNotice: !showFilters && !isHydrating && Boolean(mobileFallbackMessage),
  };
}
