import { useCallback, useDeferredValue, useMemo } from "react";
import { format, startOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/domain/content/channel-filtering";
import { filterTasksByDepthMode } from "@/domain/content/depth-mode-filter";
import { taskMatchesSelectedPeople } from "@/domain/content/person-filter";
import { taskMatchesTextQuery } from "@/domain/content/task-text-filter";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { normalizeQuickFilterState, taskMatchesQuickFilters } from "@/domain/content/quick-filter-constraints";
import { resolveMobileFallbackNoticeType } from "@/domain/content/mobile-fallback-notice";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useEmptyScopeModel } from "./use-empty-scope-model";
import { useTaskViewFiltering } from "./use-task-view-filtering";
import type { KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type { EmptyScopeModel } from "@/lib/empty-scope";
import type { Channel, ChannelMatchMode, Person, Relay, Task, TaskStateUpdate, TaskStatus } from "@/types";

interface BaseViewStateInput {
  tasks: Task[];
  allTasks: Task[];
  focusedTaskId?: string | null;
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
  feedDisclosureKey: string;
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
  tasksByStatus: Record<TaskStatus, Task[]>;
  getAncestorChain: (taskId: string) => { id: string; text: string }[];
  showContext: boolean;
}

export interface TaskViewSource {
  allTasks: Task[];
  focusedTaskId: string | null;
  currentContextId: string | null;
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

export interface CalendarSelectors {
  getTasksWithDueDates(): Task[];
  getUpcomingTasks(): Task[];
  getTasksForDay(day: Date): Task[];
  getAncestorChain(taskId: string): { id: string; text: string }[];
}

export interface TreeSelectors {
  hasActiveFilters(): boolean;
  getCurrentContextTask(): Task | null;
  getVisibleTasks(): Task[];
  getDisplayedTasks(options?: { useMobileFallback?: boolean }): Task[];
  getFilteredChildren(parentId: string): Task[];
  isDirectMatch(taskId: string): boolean;
  getComposerDefaultContent(): string;
  getEmptyStateFlags(options?: { isMobile?: boolean }): {
    shouldShowMobileScopeFallback: boolean;
    shouldShowInlineEmptyHint: boolean;
    shouldShowScopeFooterHint: boolean;
    shouldShowScreenEmptyState: boolean;
  };
}

export interface MobileFallbackNoticeState {
  effectiveSearchQuery: string;
  mobileFallbackMessage: string | null;
  shouldShowMobileFallbackNotice: boolean;
  mobileShellFocusedTaskId: string | null;
}

function clearSelectedPeople(people: Person[]): Person[] {
  return people.map((person) => (person.isSelected ? { ...person, isSelected: false } : person));
}

function buildFeedEntries(tasks: Task[], focusedTaskId?: string | null): FeedEntry[] {
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
  const currentContextId = focusedTaskId || null;
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
    searchQuery: deferredSearchQuery,
    focusedTaskId: currentContextId,
    taskById,
  });

  return {
    allTasks,
    focusedTaskId: focusedTaskId ?? null,
    currentContextId,
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
  taskId: string
): { id: string; text: string }[] {
  const chain: { id: string; text: string }[] = [];
  let current = source.taskById.get(taskId);
  while (current?.parentId) {
    const parent = source.taskById.get(current.parentId);
    if (!parent) break;
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
    tasksWithDueDatesCache = filterTasksForView({
      allTasks: source.allTasks,
      filterIndex: source.filterIndex,
      prefilteredTaskIds: source.prefilteredTaskIds,
      focusedTaskId: source.focusedTaskId,
      hideClosedTasks: true,
      searchQuery: source.searchQuery,
      people: source.people,
      quickFilters: source.quickFilters,
      includedChannels: included,
      excludedChannels: excluded,
      channelMatchMode: source.channelMatchMode,
      taskPredicate: (task) => Boolean(task.dueDate) && task.taskType === "task",
    }).filter((task) => Boolean(task.dueDate));
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
      return getAncestorChainFromSource(source, taskId);
    },
  };
}

export function createTreeSelectors(source: TaskViewSource): TreeSelectors {
  let visibilityCache:
    | {
        hasActiveFilters: boolean;
        directlyMatchingIds: Set<string>;
        allVisibleIds: Set<string>;
        baseVisibleTasks: Task[];
        visibleTasks: Task[];
      }
    | null = null;

  const getVisibility = () => {
    if (visibilityCache) return visibilityCache;
    const { included, excluded } = getIncludedExcludedChannelNames(source.channels);
    const hasActiveFilters = source.scopeModel.hasActiveFilters;
    const selectedPeople = source.people.filter((person) => person.isSelected);

    const matchesFilter = (task: Task) =>
      taskMatchesSelectedPeople(task, selectedPeople) &&
      taskMatchesQuickFilters(task, source.quickFilters) &&
      taskMatchesTextQuery(task, source.deferredSearchQuery, source.people) &&
      taskMatchesChannelFilters(task.tags, included, excluded, source.channelMatchMode);

    const directlyMatchingIds = new Set<string>();
    const allVisibleIds = new Set<string>();

    if (hasActiveFilters) {
      for (const task of source.allTasks) {
        if (matchesFilter(task)) {
          directlyMatchingIds.add(task.id);
          allVisibleIds.add(task.id);
          let current = source.taskById.get(task.id);
          while (current?.parentId) {
            allVisibleIds.add(current.parentId);
            current = source.taskById.get(current.parentId);
          }
        }
      }
      const addDescendants = (parentId: string) => {
        const children = source.childrenMap.get(parentId) || [];
        for (const child of children) {
          allVisibleIds.add(child.id);
          addDescendants(child.id);
        }
      };
      directlyMatchingIds.forEach((taskId) => addDescendants(taskId));
    }

    let rootTasks: Task[];
    if (source.currentContextId) {
      rootTasks = source.childrenMap.get(source.currentContextId) || [];
    } else {
      rootTasks = (source.childrenMap.get(undefined) || []).filter((task) => task.taskType !== "comment");
    }
    rootTasks = rootTasks.filter((task) => source.prefilteredTaskIds.has(task.id));
    const baseVisibleTasks = sortTasks(rootTasks, source.sortContext);
    const visibleTasks = hasActiveFilters
      ? baseVisibleTasks.filter((task) => allVisibleIds.has(task.id))
      : baseVisibleTasks;

    visibilityCache = {
      hasActiveFilters,
      directlyMatchingIds,
      allVisibleIds,
      baseVisibleTasks,
      visibleTasks,
    };
    return visibilityCache;
  };

  return {
    hasActiveFilters() {
      return getVisibility().hasActiveFilters;
    },
    getCurrentContextTask() {
      return source.currentContextId ? source.taskById.get(source.currentContextId) || null : null;
    },
    getVisibleTasks() {
      return getVisibility().visibleTasks;
    },
    getDisplayedTasks(options = {}) {
      const visibility = getVisibility();
      const shouldUseFallback =
        Boolean(options.useMobileFallback) &&
        source.scopeModel.hasActiveFilters &&
        visibility.visibleTasks.length === 0 &&
        visibility.baseVisibleTasks.length > 0;
      return shouldUseFallback ? visibility.baseVisibleTasks : visibility.visibleTasks;
    },
    getFilteredChildren(parentId: string) {
      let children = source.childrenMap.get(parentId) || [];
      children = children.filter((child) => source.prefilteredTaskIds.has(child.id));
      if (getVisibility().hasActiveFilters) {
        children = children.filter((child) => getVisibility().allVisibleIds.has(child.id));
      }
      return sortTasks(children, source.sortContext);
    },
    isDirectMatch(taskId: string) {
      const visibility = getVisibility();
      if (!visibility.hasActiveFilters) return true;
      return visibility.directlyMatchingIds.has(taskId);
    },
    getComposerDefaultContent() {
      return buildComposePrefillFromFiltersAndContext(
        source.channels,
        source.currentContextId ? source.taskById.get(source.currentContextId)?.tags : undefined
      );
    },
    getEmptyStateFlags(options = {}) {
      const visibility = getVisibility();
      const shouldShowMobileScopeFallback =
        Boolean(options.isMobile) &&
        source.scopeModel.hasActiveFilters &&
        visibility.visibleTasks.length === 0 &&
        visibility.baseVisibleTasks.length > 0;
      const shouldShowInlineEmptyHint =
        !options.isMobile &&
        source.scopeModel.hasActiveFilters &&
        visibility.visibleTasks.length === 0 &&
        visibility.baseVisibleTasks.length > 0;
      return {
        shouldShowMobileScopeFallback,
        shouldShowInlineEmptyHint,
        shouldShowScopeFooterHint:
          !options.isMobile && source.scopeModel.hasSelectedScope && visibility.visibleTasks.length > 0,
        shouldShowScreenEmptyState:
          visibility.visibleTasks.length === 0 &&
          !shouldShowMobileScopeFallback &&
          !shouldShowInlineEmptyHint,
      };
    },
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
  const activeChannelFiltersKey = useMemo(
    () =>
      channels
        .filter((channel) => channel.filterState && channel.filterState !== "neutral")
        .map((channel) => `${channel.id}:${channel.filterState}`)
        .sort()
        .join(","),
    [channels]
  );
  const selectedPeopleKey = useMemo(
    () =>
      people
        .filter((person) => person.isSelected)
        .map((person) => person.id)
        .sort()
        .join(","),
    [people]
  );
  const feedDisclosureKey = useMemo(
    () => [focusedTaskId || "", deferredSearchQuery.trim().toLowerCase(), channelMatchMode, activeChannelFiltersKey, selectedPeopleKey].join("|"),
    [activeChannelFiltersKey, channelMatchMode, deferredSearchQuery, focusedTaskId, selectedPeopleKey]
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
    feedDisclosureKey,
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
      const chain: { id: string; text: string }[] = [];
      let current = taskById.get(taskId);
      while (current?.parentId) {
        const parent = taskById.get(current.parentId);
        if (!parent) break;
        chain.unshift({ id: parent.id, text: formatBreadcrumbLabel(parent.content) });
        current = parent;
      }
      return chain;
    },
    [taskById]
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
  const tasksByStatus = useMemo<Record<TaskStatus, Task[]>>(() => {
    const grouped: Record<TaskStatus, Task[]> = { todo: [], "in-progress": [], done: [], closed: [] };
    kanbanTasks.forEach((task) => {
      grouped[task.status || "todo"].push(task);
    });
    grouped.todo = sortTasks(grouped.todo, sortContext);
    grouped["in-progress"] = sortTasks(grouped["in-progress"], sortContext);
    grouped.done = [...grouped.done].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    grouped.closed = [...grouped.closed].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return grouped;
  }, [kanbanTasks, sortContext]);
  return {
    kanbanTasks,
    orderedKanbanTasks: [...tasksByStatus.todo, ...tasksByStatus["in-progress"], ...tasksByStatus.done, ...tasksByStatus.closed],
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
  const { t } = useTranslation();
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
  const scopedMatchesWithSearch = useMemo(
    () =>
      filterTasksForView({
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        searchQuery,
        people,
        quickFilters,
        includedChannels: includedChannelNames,
        excludedChannels: excludedChannelNames,
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [activeViewTaskPredicate, allTasks, channelMatchMode, excludedChannelNames, focusedTaskId, hideClosedForActiveView, includeFocusedTaskForActiveView, includedChannelNames, people, prefilteredTaskIds, quickFilters, searchQuery, taskFilterIndex]
  );
  const scopedMatchesWithoutSearch = useMemo(
    () =>
      filterTasksForView({
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        searchQuery: "",
        people,
        quickFilters,
        includedChannels: includedChannelNames,
        excludedChannels: excludedChannelNames,
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [activeViewTaskPredicate, allTasks, channelMatchMode, excludedChannelNames, focusedTaskId, hideClosedForActiveView, includeFocusedTaskForActiveView, includedChannelNames, people, prefilteredTaskIds, quickFilters, taskFilterIndex]
  );
  const sourceMatchesWithoutScope = useMemo(
    () =>
      filterTasksForView({
        allTasks,
        filterIndex: taskFilterIndex,
        prefilteredTaskIds,
        focusedTaskId,
        includeFocusedTask: includeFocusedTaskForActiveView,
        hideClosedTasks: hideClosedForActiveView,
        searchQuery: "",
        people: neutralPeople,
        quickFilters,
        includedChannels: [],
        excludedChannels: [],
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [activeViewTaskPredicate, allTasks, channelMatchMode, focusedTaskId, hideClosedForActiveView, includeFocusedTaskForActiveView, neutralPeople, prefilteredTaskIds, quickFilters, taskFilterIndex]
  );
  const hasScopedMatchesWithSearch = scopedMatchesWithSearch.length > 0;
  const hasScopedMatchesWithoutSearch = scopedMatchesWithoutSearch.length > 0;
  const hasSourceContent = sourceMatchesWithoutScope.length > 0;
  const shouldOmitSearchQuery = !showFilters && hasSearchQuery && !hasScopedMatchesWithSearch && hasSourceContent;
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
    mobileShellFocusedTaskId: focusedTaskId || null,
  };
}
