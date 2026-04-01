import { useCallback, useDeferredValue, useMemo } from "react";
import { format, startOfDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "@/domain/content/channel-filtering";
import { filterTasksByDepthMode } from "@/domain/content/depth-mode-filter";
import { taskMatchesTextQuery } from "@/domain/content/task-text-filter";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { buildComposePrefillFromFiltersAndContext } from "@/lib/compose-prefill";
import { isTaskTerminalStatus } from "@/domain/content/task-status";
import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";
import { resolveMobileFallbackNoticeType } from "@/domain/content/mobile-fallback-notice";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useEmptyScopeModel } from "./use-empty-scope-model";
import { useTaskViewFiltering } from "./use-task-view-filtering";
import type { KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type { Task, TaskStateUpdate, TaskStatus } from "@/types";

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

export interface CalendarViewState {
  searchQuery: string;
  tasksWithDueDates: Task[];
  upcomingTasks: Task[];
  tasksByDay: Map<string, Task[]>;
  getTasksForDay: (day: Date) => Task[];
  getAncestorChain: (taskId: string) => { id: string; text: string }[];
}

export interface TaskTreeViewState {
  searchQuery: string;
  currentContextId: string | null;
  currentContextTask: Task | null;
  childrenMap: Map<string | undefined, Task[]>;
  sortContext: SortContext;
  activeRelays: { id: string; name: string; icon: string; isActive?: boolean }[];
  displayedTasks: Task[];
  visibleTasks: Task[];
  hasActiveFilters: boolean;
  shouldShowMobileScopeFallback: boolean;
  shouldShowInlineEmptyHint: boolean;
  shouldShowScopeFooterHint: boolean;
  shouldShowScreenEmptyState: boolean;
  composerDefaultContent: string;
  getFilteredChildren: (parentId: string) => Task[];
  isTaskDirectMatch: (taskId: string) => boolean;
}

export interface MobileFallbackNoticeState {
  effectiveSearchQuery: string;
  mobileFallbackMessage: string | null;
  shouldShowMobileFallbackNotice: boolean;
  mobileShellFocusedTaskId: string | null;
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

export function useFeedViewState({
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
}: BaseViewStateInput): FeedViewState {
  const { relays, channels, people, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } =
    useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredFeedTasks = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    includeFocusedTask: true,
    hideClosedTasks: true,
    searchQuery: deferredSearchQuery,
    people,
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
    people,
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
    people,
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
    searchQuery: deferredSearchQuery,
    focusedTaskId,
    taskById,
  });
  const hasSourceFeedContent = allFeedEntries.length > 0;
  const shouldShowMobileScopeFallback =
    scopeModel.hasActiveFilters && feedEntries.length === 0 && hasSourceFeedContent;
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
    shouldShowInlineEmptyHint: scopeModel.hasActiveFilters && feedEntries.length === 0 && hasSourceFeedContent,
    shouldShowScopeFooterHint: scopeModel.hasSelectedScope && feedEntries.length > 0,
    shouldShowScreenEmptyState: feedEntries.length === 0,
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
  const { relays, channels, people, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } =
    useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const filteredTaskCandidates = useTaskViewFiltering({
    allTasks,
    tasks,
    focusedTaskId,
    searchQuery,
    people,
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
  const { channels, people, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } = useFeedSurfaceState();
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

export function useCalendarViewState({
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
}: BaseViewStateInput): CalendarViewState {
  const { channels, people, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } = useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const sortContext = useMemo<SortContext>(() => ({ childrenMap, allTasks, taskById }), [allTasks, childrenMap, taskById]);
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
    hideClosedTasks: true,
    searchQuery,
    people,
    channels,
    channelMatchMode,
    taskPredicate: (task) => Boolean(task.dueDate) && task.taskType === "task",
  });
  const tasksWithDueDates = useMemo(
    () => filteredTaskCandidates.filter((task) => Boolean(task.dueDate)),
    [filteredTaskCandidates]
  );
  const tasksByDay = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const task of tasksWithDueDates) {
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
      byDay.set(dayKey, sortTasks(dayTasks, sortContext));
    }
    return byDay;
  }, [sortContext, tasksWithDueDates]);
  const getTasksForDay = useCallback(
    (day: Date) => tasksByDay.get(format(startOfDay(day), "yyyy-MM-dd")) || [],
    [tasksByDay]
  );
  return {
    searchQuery,
    tasksWithDueDates,
    upcomingTasks: sortTasks(
      tasksWithDueDates.filter((task) => !isTaskTerminalStatus(task.status)),
      sortContext
    ),
    tasksByDay,
    getTasksForDay,
    getAncestorChain,
  };
}

export function useTaskTreeViewState({
  tasks,
  allTasks,
  focusedTaskId,
  searchQueryOverride,
}: BaseViewStateInput): TaskTreeViewState {
  const { relays, channels, people, searchQuery: surfaceSearchQuery, channelMatchMode = "and" } =
    useFeedSurfaceState();
  const searchQuery = searchQueryOverride ?? surfaceSearchQuery;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const currentContextId = focusedTaskId || null;
  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const filteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const activeRelays = useMemo(() => relays.filter((relay) => relay.isActive), [relays]);
  const sortContext = useMemo<SortContext>(() => ({ childrenMap, allTasks, taskById }), [allTasks, childrenMap, taskById]);
  const { included: includedChannels, excluded: excludedChannels } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const taskMatchesFilter = useCallback(
    (task: Task, query: string, included: string[], excluded: string[]) => {
      const matchesQuery = taskMatchesTextQuery(task, query, people);
      const matchesChannels = taskMatchesChannelFilters(task.tags, included, excluded, channelMatchMode);
      return matchesQuery && matchesChannels;
    },
    [channelMatchMode, people]
  );
  const getDirectlyMatchingTasks = useCallback(
    (query: string, nextIncludedChannels: string[], nextExcludedChannels: string[]) => {
      const matching = new Set<string>();
      for (const task of allTasks) {
        if (taskMatchesFilter(task, query, nextIncludedChannels, nextExcludedChannels)) {
          matching.add(task.id);
        }
      }
      return matching;
    },
    [allTasks, taskMatchesFilter]
  );
  const getDescendants = useCallback(
    (taskIds: Set<string>) => {
      const descendants = new Set<string>();
      const addDescendants = (parentId: string) => {
        const children = childrenMap.get(parentId) || [];
        for (const child of children) {
          descendants.add(child.id);
          addDescendants(child.id);
        }
      };
      taskIds.forEach((id) => addDescendants(id));
      return descendants;
    },
    [childrenMap]
  );
  const getAncestors = useCallback(
    (matchingIds: Set<string>) => {
      const ancestors = new Set<string>();
      const findAncestors = (taskId: string) => {
        const task = taskById.get(taskId);
        if (task?.parentId) {
          ancestors.add(task.parentId);
          findAncestors(task.parentId);
        }
      };
      matchingIds.forEach((id) => findAncestors(id));
      return ancestors;
    },
    [taskById]
  );
  const hasActiveFilters = searchQuery.trim() !== "" || includedChannels.length > 0 || excludedChannels.length > 0;
  const { directlyMatchingIds, allVisibleIds } = useMemo(() => {
    if (!hasActiveFilters) {
      return { directlyMatchingIds: new Set<string>(), allVisibleIds: new Set<string>() };
    }
    const directly = getDirectlyMatchingTasks(deferredSearchQuery, includedChannels, excludedChannels);
    const ancestors = getAncestors(directly);
    const descendants = getDescendants(directly);
    return {
      directlyMatchingIds: directly,
      allVisibleIds: new Set([...directly, ...ancestors, ...descendants]),
    };
  }, [deferredSearchQuery, excludedChannels, getAncestors, getDescendants, getDirectlyMatchingTasks, hasActiveFilters, includedChannels]);
  const baseVisibleTasks = useMemo(() => {
    let rootTasks: Task[];
    if (currentContextId) {
      rootTasks = childrenMap.get(currentContextId) || [];
    } else {
      rootTasks = (childrenMap.get(undefined) || []).filter((task) => task.taskType !== "comment");
    }
    rootTasks = rootTasks.filter((task) => filteredTaskIds.has(task.id));
    return sortTasks(rootTasks, sortContext);
  }, [childrenMap, currentContextId, filteredTaskIds, sortContext]);
  const visibleTasks = useMemo(() => {
    if (!hasActiveFilters) return baseVisibleTasks;
    return baseVisibleTasks.filter((task) => allVisibleIds.has(task.id));
  }, [allVisibleIds, baseVisibleTasks, hasActiveFilters]);
  const scopeModel = useEmptyScopeModel({ relays, channels, people, searchQuery: deferredSearchQuery, focusedTaskId: currentContextId, taskById });
  const hasSourceTaskContent = baseVisibleTasks.length > 0;
  const shouldShowMobileScopeFallback = scopeModel.hasActiveFilters && visibleTasks.length === 0 && hasSourceTaskContent;
  const displayedTasks = shouldShowMobileScopeFallback ? baseVisibleTasks : visibleTasks;
  const getFilteredChildren = useCallback(
    (parentId: string) => {
      let children = childrenMap.get(parentId) || [];
      children = children.filter((child) => filteredTaskIds.has(child.id));
      if (hasActiveFilters) {
        children = children.filter((child) => allVisibleIds.has(child.id));
      }
      return sortTasks(children, sortContext);
    },
    [allVisibleIds, childrenMap, filteredTaskIds, hasActiveFilters, sortContext]
  );
  const isTaskDirectMatch = useCallback((taskId: string) => directlyMatchingIds.has(taskId), [directlyMatchingIds]);
  const currentContextTask = currentContextId ? taskById.get(currentContextId) || null : null;
  return {
    searchQuery,
    currentContextId,
    currentContextTask,
    childrenMap,
    sortContext,
    activeRelays,
    displayedTasks,
    visibleTasks,
    hasActiveFilters,
    shouldShowMobileScopeFallback,
    shouldShowInlineEmptyHint: scopeModel.hasActiveFilters && visibleTasks.length === 0 && hasSourceTaskContent,
    shouldShowScopeFooterHint: scopeModel.hasSelectedScope && visibleTasks.length > 0,
    shouldShowScreenEmptyState: visibleTasks.length === 0,
    composerDefaultContent: buildComposePrefillFromFiltersAndContext(channels, currentContextTask?.tags),
    getFilteredChildren,
    isTaskDirectMatch,
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
  const { relays, channels, people, searchQuery, channelMatchMode = "and" } = useFeedSurfaceState();
  const hasSearchQuery = searchQuery.trim().length > 0;
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const prefilteredTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
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
        includedChannels: includedChannelNames,
        excludedChannels: excludedChannelNames,
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [activeViewTaskPredicate, allTasks, channelMatchMode, excludedChannelNames, focusedTaskId, hideClosedForActiveView, includeFocusedTaskForActiveView, includedChannelNames, people, prefilteredTaskIds, searchQuery, taskFilterIndex]
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
        includedChannels: includedChannelNames,
        excludedChannels: excludedChannelNames,
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [activeViewTaskPredicate, allTasks, channelMatchMode, excludedChannelNames, focusedTaskId, hideClosedForActiveView, includeFocusedTaskForActiveView, includedChannelNames, people, prefilteredTaskIds, taskFilterIndex]
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
        people,
        includedChannels: [],
        excludedChannels: [],
        channelMatchMode,
        taskPredicate: activeViewTaskPredicate,
      }),
    [activeViewTaskPredicate, allTasks, channelMatchMode, focusedTaskId, hideClosedForActiveView, includeFocusedTaskForActiveView, people, prefilteredTaskIds, taskFilterIndex]
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
    mobileShellFocusedTaskId: currentView !== "list" && currentView !== "calendar" ? focusedTaskId || null : null,
  };
}
