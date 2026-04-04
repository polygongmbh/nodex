import { taskMatchesSelectedPeople } from "@/domain/content/person-filter";
import { normalizeQuickFilterState, taskMatchesQuickFilters } from "@/domain/content/quick-filter-constraints";
import {
  buildTaskSearchableText,
  normalizeTaskSearchValue,
  searchableTextMatchesQuery,
} from "@/domain/content/task-search-document";
import type { ChannelMatchMode, QuickFilterState, Task } from "@/types";
import type { Person } from "@/types/person";

function normalize(value: string): string {
  return normalizeTaskSearchValue(value);
}

export interface TaskViewFilterIndex {
  childrenByParentId: Map<string, string[]>;
  descendantIdsByTaskId: Map<string, Set<string>>;
  searchableTextByTaskId: Map<string, string>;
  normalizedTagsByTaskId: Map<string, Set<string>>;
}

export function buildTaskViewFilterIndex(
  allTasks: Task[],
  people: Person[] = []
): TaskViewFilterIndex {
  const childrenByParentId = new Map<string, string[]>();
  const searchableTextByTaskId = new Map<string, string>();
  const normalizedTagsByTaskId = new Map<string, Set<string>>();
  const peopleById = new Map(
    people.map((person) => [person.id.trim().toLowerCase(), person] as const)
  );

  for (const task of allTasks) {
    if (task.parentId) {
      const children = childrenByParentId.get(task.parentId);
      if (children) {
        children.push(task.id);
      } else {
        childrenByParentId.set(task.parentId, [task.id]);
      }
    }

    const tags = (task.tags ?? []).map(normalize).filter(Boolean);
    normalizedTagsByTaskId.set(task.id, new Set(tags));
    searchableTextByTaskId.set(task.id, buildTaskSearchableText(task, peopleById));
  }

  const descendantIdsByTaskId = new Map<string, Set<string>>();
  const collectDescendants = (taskId: string): Set<string> => {
    const cached = descendantIdsByTaskId.get(taskId);
    if (cached) return cached;

    const descendants = new Set<string>();
    const children = childrenByParentId.get(taskId) || [];
    for (const childId of children) {
      descendants.add(childId);
      const childDescendants = collectDescendants(childId);
      for (const descendantId of childDescendants) {
        descendants.add(descendantId);
      }
    }

    descendantIdsByTaskId.set(taskId, descendants);
    return descendants;
  };

  for (const task of allTasks) {
    collectDescendants(task.id);
  }

  return {
    childrenByParentId,
    descendantIdsByTaskId,
    searchableTextByTaskId,
    normalizedTagsByTaskId,
  };
}

export function getDescendantTaskIds(allTasks: Task[], rootTaskId: string): Set<string> {
  return buildTaskViewFilterIndex(allTasks).descendantIdsByTaskId.get(rootTaskId) ?? new Set<string>();
}

function taskMatchesSearchIndex(
  taskId: string,
  searchQuery: string,
  filterIndex: TaskViewFilterIndex
): boolean {
  const haystack = filterIndex.searchableTextByTaskId.get(taskId) ?? "";
  return searchableTextMatchesQuery(haystack, searchQuery);
}

function taskMatchesChannelIndex(
  taskId: string,
  includedChannels: string[],
  excludedChannels: string[],
  mode: ChannelMatchMode,
  filterIndex: TaskViewFilterIndex
): boolean {
  const taskTagSet = filterIndex.normalizedTagsByTaskId.get(taskId) ?? new Set<string>();

  for (const excluded of excludedChannels) {
    if (taskTagSet.has(excluded)) return false;
  }

  if (includedChannels.length === 0) return true;
  if (mode === "or") return includedChannels.some((included) => taskTagSet.has(included));
  return includedChannels.every((included) => taskTagSet.has(included));
}

interface FilterTasksForViewParams {
  allTasks: Task[];
  filterIndex?: TaskViewFilterIndex;
  prefilteredTaskIds: Set<string>;
  focusedTaskId?: string | null;
  includeFocusedTask?: boolean;
  hideClosedTasks?: boolean;
  searchQuery: string;
  people: Person[];
  quickFilters?: QuickFilterState;
  includedChannels: string[];
  excludedChannels: string[];
  channelMatchMode: ChannelMatchMode;
  taskPredicate?: (task: Task) => boolean;
}

export function getDirectMatchTaskIdsForView({
  allTasks,
  filterIndex,
  prefilteredTaskIds,
  focusedTaskId,
  includeFocusedTask = false,
  hideClosedTasks = false,
  searchQuery,
  people,
  quickFilters = normalizeQuickFilterState(),
  includedChannels,
  excludedChannels,
  channelMatchMode,
  taskPredicate,
}: FilterTasksForViewParams): Set<string> {
  const effectiveFilterIndex = filterIndex ?? buildTaskViewFilterIndex(allTasks, people);
  const descendantIds = focusedTaskId
    ? effectiveFilterIndex.descendantIdsByTaskId.get(focusedTaskId) ?? new Set<string>()
    : null;
  const selectedPeople = people.filter((person) => person.isSelected);
  const matchingIds = new Set<string>();

  for (const task of allTasks) {
    const isExplicitlyFocusedTask =
      includeFocusedTask &&
      Boolean(focusedTaskId) &&
      task.id === focusedTaskId;

    if (taskPredicate && !taskPredicate(task)) continue;
    if (!prefilteredTaskIds.has(task.id)) continue;
    if (hideClosedTasks && task.status === "closed" && !isExplicitlyFocusedTask) continue;
    if (!taskMatchesSelectedPeople(task, selectedPeople)) continue;
    if (!taskMatchesQuickFilters(task, quickFilters)) continue;

    if (focusedTaskId) {
      if (task.id === focusedTaskId) {
        if (!includeFocusedTask) continue;
      } else if (!descendantIds?.has(task.id)) {
        continue;
      }
    }

    if (!taskMatchesSearchIndex(task.id, searchQuery, effectiveFilterIndex)) {
      continue;
    }

    if (!taskMatchesChannelIndex(
      task.id,
      includedChannels,
      excludedChannels,
      channelMatchMode,
      effectiveFilterIndex
    )) {
      continue;
    }

    matchingIds.add(task.id);
  }

  return matchingIds;
}

export function filterTasksForView(params: FilterTasksForViewParams): Task[] {
  const matchingIds = getDirectMatchTaskIdsForView(params);
  return params.allTasks.filter((task) => matchingIds.has(task.id));
}
