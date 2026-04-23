import { useCallback, useDeferredValue, useMemo } from "react";
import { format, startOfDay } from "date-fns";
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
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { normalizeQuickFilterState, taskMatchesQuickFilters } from "@/domain/content/quick-filter-constraints";
import { resolveMobileFallbackNoticeType } from "@/domain/content/mobile-fallback-notice";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useEmptyScopeModel } from "./use-empty-scope-model";
import { useTaskViewFiltering } from "./use-task-view-filtering";
import { sortByLatestModified } from "@/lib/kanban-sorting";
import type { KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type { EmptyScopeModel } from "@/lib/empty-scope";
import type { Channel, ChannelMatchMode, Relay, Task, TaskStateUpdate, TaskStatusType } from "@/types";
import type { Person } from "@/types/person";

interface BaseViewStateInput {
  tasks: Task[];
  allTasks: Task[];
  focusedTaskId: string | null;
  searchQueryOverride?: string;
}

interface MobileScopedViewStateInput extends BaseViewStateInput {
  currentView: "feed" | "tree" | "list" | "calendar";
  showFilters: boolean;
  isHydrating?: boolean;
}

export interface FeedEntry {
  type: "task" | "state-update";
  id: string;
  timestamp: Date;
  task: Task;
  update?: TaskStateUpdate;
}

export interface FeedViewState {
  searchQuery: string;
  focusedTask: Task | null;
  taskById: Map<string, Task>;
  feedTasks: Task[];
  allFeedEntries: FeedEntry[];
  feedEntries: FeedEntry[];
  activeFeedEntries: FeedEntry[];
  mediaPreviewTasks: Task[];
  shouldShowMobileScopeFallback: boolean;
  shouldShowInlineEmptyHint: boolean;
  shouldShowScopeFooterHint: boolean;
  shouldShowScreenEmptyState: boolean;
  composerDefaultContent: string;
}

export interface ListViewState {
  searchQuery: string;
  focusedTask: Task | null;
  taskById: Map<string, Task>;
  filteredTaskCandidates: Task[];
  baseListTaskCandidates: Task[];
  hasActiveFilters: boolean;
  hasSelectedScope: boolean;
  composerDefaultContent: string;
}

export interface KanbanViewState {
  kanbanTasks: Task[];
  orderedKanbanTasks: Task[];
  tasksByStatus: Record<TaskStatusType, Task[]>;
  getAncestorChain: (taskId: string) => { id: string; text: string }[];
  showContext: boolean;
}

export interface TaskViewSource {
  allTasks: Task[];
  focusedTaskId: string | null;
  searchQuery: string;
  deferredSearchQuery: string;
  relays: Relay[];
  activeRelays: Relay[];
  channels: Channel[];
  neutralChannels: Channel[];
  people: Person[];
  quickFilters: ReturnType<typeof useFeedSurfaceState>["quickFilters"];
  channelMatchMode: ChannelMatchMode;
  taskById: Map<string, Task>;
  childrenMap: Map<string | undefined, Task[]>;
  prefilteredTaskIds: Set<string>;
  filterIndex: ReturnType<typeof buildTaskViewFilterIndex>;
  sortContext: SortContext;
  scopeModel: EmptyScopeModel;
}

type TreeSelectorSource = Pick<
  TaskViewSource,
  | "allTasks"
  | "focusedTaskId"
  | "deferredSearchQuery"
  | "channels"
  | "people"
  | "quickFilters"
  | "channelMatchMode"
  | "taskById"
  | "childrenMap"
  | "prefilteredTaskIds"
  | "filterIndex"
  | "sortContext"
  | "scopeModel"
>;

export interface CalendarSelectors {
  getTasksWithDueDates(): Task[];
  getUpcomingTasks(): Task[];
  getTasksForDay(day: Date): Task[];
  getAncestorChain(taskId: string): { id: string; text: string }[];
}

export interface TreeSelectors {
  hasMatchingFilters(): boolean;
  getCurrentContextTask(): Task | null;
  getVisibleTasks(): Task[];
  getDisplayedTasks(options?: { useMobileFallback?: boolean }): Task[];
  getMatchingChildren(parentId: string): Task[];
  isDirectMatch(taskId: string): boolean;
  getComposerDefaultContent(): string;
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
  baseVisibleTasks: Task[];
  visibleTasks: Task[];
}

export interface MobileFallbackNoticeState {
  effectiveSearchQuery: string;
  mobileFallbackMessage: string | null;
  shouldShowMobileFallbackNotice: boolean;
  mobileShellFocusedTaskId: string | null;
}

export function sortKanbanColumnTasks(tasks: Task[], status: TaskStatusType, sortContext: SortContext): Task[] {
  return isTaskTerminalStatus(status) ? sortByLatestModified(tasks) : sortTasks(tasks, sortContext);
}

function clearSelectedPeople(people: Person[]): Person[] {
  return people.map((person) => (person.isSelected ? { ...person, isSelected: false } : person));
}

function buildFeedEntries(tasks: Task[], focusedTaskId: string | null): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const task of [...tasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())) {
    if (task.status !== "closed" || task.id === focusedTaskId) {
      entries.push({ type: "task", id: task.id, timestamp: task.timestamp, task });
    }
    for (const update of task.stateUpdates || []) {
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

export function useTaskViewSource({
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
}: BaseViewStateInput): TaskViewSource {
  const { relays, channels, people, quickFilters, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } =
    useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const prefilteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const filterIndex = useMemo(() => buildTaskViewFilterIndex(allTasks, people), [allTasks, people]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap, allTasks, taskById }),
    [allTasks, childrenMap, taskById]
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
    allTasks,
    focusedTaskId,
    searchQuery,
    deferredSearchQuery,
    relays,
    activeRelays,
    channels,
    neutralChannels,
    people,
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
  let tasksWithDueDatesCache: Task[] | null = null;
  let tasksByDayCache: Map<string, Task[]> | null = null;
  let upcomingTasksCache: Task[] | null = null;
  const { included, excluded } = getIncludedExcludedChannelNames(source.channels);

  const getTasksWithDueDates = () => {
    if (tasksWithDueDatesCache) return tasksWithDueDatesCache;
    const request: TaskViewFilterRequest = {
      source: {
        allTasks: source.allTasks,
        filterIndex: source.filterIndex,
        prefilteredTaskIds: source.prefilteredTaskIds,
        people: source.people,
      },
      scope: {
        focusedTaskId: source.focusedTaskId,
        hideClosedTasks: true,
        taskPredicate: (task) => Boolean(task.dueDate) && task.taskType === "task",
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
    tasksWithDueDatesCache = filterTasksForView(request).filter((task) => Boolean(task.dueDate));
    return tasksWithDueDatesCache;
  };

  const getTasksByDay = () => {
    if (tasksByDayCache) return tasksByDayCache;
    const byDay = new Map<string, Task[]>();
    for (const task of getTasksWithDueDates()) {
      if (!task.dueDate) continue;
      const dayKey = format(startOfDay(task.dueDate), "yyyy-MM-dd");
      const bucket = byDay.get(dayKey);
      if (bucket) {
        bucket.push(task);
      } else {
        byDay.set(dayKey, [task]);
      }
    }
    for (const [dayKey, dayTasks] of byDay.entries()) {
      byDay.set(dayKey, sortTasks(dayTasks, source.sortContext));
    }
    tasksByDayCache = byDay;
    return tasksByDayCache;
  };

  return {
    getTasksWithDueDates,
    getUpcomingTasks() {
      if (upcomingTasksCache) return upcomingTasksCache;
      upcomingTasksCache = sortTasks(
        getTasksWithDueDates().filter((task) => !isTaskTerminalStatus(task.status)),
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
    const hasSelectedPeople = source.people.some((person) => person.isSelected);
    const hasMatchingFilters =
      source.deferredSearchQuery.trim().length > 0 ||
      included.length > 0 ||
      excluded.length > 0 ||
      hasSelectedPeople;

    if (hasMatchingFilters) {
      const directlyMatchingIds = getDirectMatchTaskIdsForView({
        source: {
          allTasks: source.allTasks,
          filterIndex: source.filterIndex,
          prefilteredTaskIds: source.prefilteredTaskIds,
          people: source.people,
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
    getComposerDefaultContent() {
      return buildComposePrefillFromFiltersAndContext(
        source.channels,
        source.focusedTaskId ? source.taskById.get(source.focusedTaskId)?.tags : undefined
      );
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
  const taskById = sortContext.taskById ?? new Map(sortContext.allTasks.map((task) => [task.id, task] as const));
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

  let rootTasks: Task[];
  if (focusedTaskId) {
    rootTasks = childrenMap.get(focusedTaskId) || [];
  } else {
    rootTasks = (childrenMap.get(undefined) || []).filter((task) => task.taskType !== "comment");
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
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
  isMobile = false,
}: BaseViewStateInput & { isMobile?: boolean }): FeedViewState {
  const { relays, channels, people, quickFilters, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } =
    useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const neutralPeople = useMemo(() => clearSelectedPeople(people), [people]);
  const filteredFeedTasks = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: deferredSearchQuery,
    people,
    quickFilters,
    channels,
    channelMatchMode,
  });
  const neutralChannels = useMemo(
    () => channels.map((channel) => ({ ...channel, filterState: "neutral" as const })),
    [channels]
  );
  const unfilteredFeedTasks = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: "",
    people: neutralPeople,
    quickFilters,
    channels: neutralChannels,
    channelMatchMode,
  });
  const filteredFeedTasksWithClosed = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: false,
    searchQuery: deferredSearchQuery,
    people,
    quickFilters,
    channels,
    channelMatchMode,
  });
  const unfilteredFeedTasksWithClosed = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: false,
    searchQuery: "",
    people: neutralPeople,
    quickFilters,
    channels: neutralChannels,
    channelMatchMode,
  });
  const feedTasks = useMemo(
    () => [...filteredFeedTasks].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [filteredFeedTasks]
  );
  const allFeedEntries = useMemo(
    () => buildFeedEntries(unfilteredFeedTasksWithClosed, focusedTaskId),
    [focusedTaskId, unfilteredFeedTasksWithClosed]
  );
  const feedEntries = useMemo(
    () => buildFeedEntries(filteredFeedTasksWithClosed, focusedTaskId),
    [filteredFeedTasksWithClosed, focusedTaskId]
  );
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const focusedTask = focusedTaskId ? taskById.get(focusedTaskId) || null : null;
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
    searchQuery,
    focusedTask,
    taskById,
    feedTasks,
    allFeedEntries,
    feedEntries,
    activeFeedEntries,
    mediaPreviewTasks: shouldShowMobileScopeFallback ? unfilteredFeedTasks : feedTasks,
    shouldShowMobileScopeFallback,
    shouldShowInlineEmptyHint,
    shouldShowScopeFooterHint: !isMobile && scopeModel.hasSelectedScope && feedEntries.length > 0,
    shouldShowScreenEmptyState,
    composerDefaultContent: buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags),
  };
}

export function useListViewState({
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
  depthMode = "leaves",
}: BaseViewStateInput & { depthMode?: KanbanDepthMode }): ListViewState {
  const { relays, channels, people, quickFilters, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } =
    useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const filteredTaskCandidates = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    searchQuery,
    people,
    quickFilters,
    channels,
    channelMatchMode,
    taskPredicate: (task) => task.taskType === "task",
  });
  const baseListTaskCandidates = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    searchQuery: "",
    people,
    quickFilters,
    channels: channels.map((channel) => ({ ...channel, filterState: "neutral" as const })),
    channelMatchMode,
    taskPredicate: (task) => task.taskType === "task",
  });
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const focusedTask = focusedTaskId ? taskById.get(focusedTaskId) || null : null;
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
    searchQuery,
    focusedTaskId,
    allTasks,
  });
  return {
    searchQuery,
    focusedTask,
    taskById,
    filteredTaskCandidates,
    baseListTaskCandidates,
    hasActiveFilters: scopeModel.hasActiveFilters,
    hasSelectedScope: scopeModel.hasSelectedScope,
    composerDefaultContent: buildComposePrefillFromFiltersAndContext(channels, focusedTask?.tags),
  };
}

export function useKanbanViewState({
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
  depthMode,
}: BaseViewStateInput & { depthMode: KanbanDepthMode }): KanbanViewState {
  const { channels, people, quickFilters, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } = useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const sortContext = useMemo<SortContext>(() => ({ childrenMap, allTasks, taskById }), [allTasks, childrenMap, taskById]);
  const hasChildren = useCallback(
    (taskId: string): boolean => (childrenMap.get(taskId) || []).some((candidate) => candidate.taskType === "task"),
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
  const filteredTaskCandidates = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    searchQuery,
    people,
    quickFilters,
    channels,
    channelMatchMode,
    taskPredicate: (task) => task.taskType === "task",
  });
  const kanbanTasks = useMemo(
    () => filterTasksByDepthMode({ tasks: filteredTaskCandidates, depthMode, focusedTaskId, getDepth, hasChildren }),
    [depthMode, filteredTaskCandidates, focusedTaskId, getDepth, hasChildren]
  );
  const tasksByStatus = useMemo<Record<TaskStatusType, Task[]>>(() => {
    const grouped: Record<TaskStatusType, Task[]> = { open: [], active: [], done: [], closed: [] };
    kanbanTasks.forEach((task) => {
      grouped[task.status].push(task);
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
  tasks,
  allTasks,
  focusedTaskId,
  currentView,
  showFilters,
  isHydrating = false,
}: MobileScopedViewStateInput): MobileFallbackNoticeState {
  const { t } = useTranslation("tasks");
  const { relays, channels, people, quickFilters, searchQuery, channelMatchMode = "and" } = useFeedSurfaceState();
  const hasSearchQuery = searchQuery.trim().length > 0;
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const prefilteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const neutralPeople = useMemo(() => clearSelectedPeople(people), [people]);
  const taskFilterIndex = useMemo(() => buildTaskViewFilterIndex(allTasks, people), [allTasks, people]);
  const { included: includedChannelNames, excluded: excludedChannelNames } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const activeViewTaskPredicate = useMemo(() => {
    if (currentView !== "list" && currentView !== "calendar") {
      return undefined;
    }
    return (task: Task) => task.taskType === "task" && Boolean(task.dueDate) && !isTaskTerminalStatus(task.status);
  }, [currentView]);
  const includeFocusedTaskForActiveView = currentView === "feed";
  const hideClosedForActiveView = currentView === "feed";
  type ActiveViewMatchVariant = "scopedWithSearch" | "scopedWithoutSearch" | "sourceWithoutScope";
  function hasActiveViewMatches(variant: ActiveViewMatchVariant): boolean {
    const useScopedFilters = variant !== "sourceWithoutScope";
    const effectivePeople = variant === "sourceWithoutScope" ? neutralPeople : people;
    const effectiveSearchQuery = variant === "scopedWithSearch" ? searchQuery : "";

    return getDirectMatchTaskIdsForView({
      source: {
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        people: effectivePeople,
      },
      scope: {
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        taskPredicate: activeViewTaskPredicate,
      },
      criteria: {
        searchQuery: effectiveSearchQuery,
        quickFilters,
        channels: {
          included: useScopedFilters ? includedChannelNames : [],
          excluded: useScopedFilters ? excludedChannelNames : [],
          matchMode: channelMatchMode,
        },
      },
    }).size > 0;
  }
  const hasScopedMatchesWithSearch = hasActiveViewMatches("scopedWithSearch");
  const hasScopedMatchesWithoutSearch = hasActiveViewMatches("scopedWithoutSearch");
  const hasSourceContent = hasActiveViewMatches("sourceWithoutScope");
  const shouldOmitSearchQuery =
    !showFilters &&
    hasSearchQuery &&
    !hasScopedMatchesWithSearch &&
    hasScopedMatchesWithoutSearch;
  const effectiveSearchQuery = shouldOmitSearchQuery ? "" : searchQuery;
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
    effectiveSearchQuery,
    mobileFallbackMessage,
    shouldShowMobileFallbackNotice: !showFilters && !isHydrating && Boolean(mobileFallbackMessage),
    mobileShellFocusedTaskId: focusedTaskId,
  };
}
