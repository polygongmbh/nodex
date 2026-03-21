import type { ChannelMatchMode, Person, Task } from "@/types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
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

    const mentions = task.mentions ?? [];
    const assignees = task.assigneePubkeys ?? [];
    const authorId = task.author?.id?.trim().toLowerCase();
    const resolvedAuthor =
      (authorId ? peopleById.get(authorId) : undefined) ?? task.author;

    searchableTextByTaskId.set(
      task.id,
      [
        task.content,
        ...tags,
        ...tags.map((tag) => `#${tag}`),
        ...mentions,
        ...mentions.map((mention) => `@${mention}`),
        ...assignees,
        ...assignees.map((assignee) => `@${assignee}`),
        resolvedAuthor?.name ?? "",
        resolvedAuthor?.displayName ?? "",
        resolvedAuthor?.nip05 ?? "",
        resolvedAuthor?.id ?? "",
      ]
        .filter(Boolean)
        .map(normalize)
        .join("\n")
    );
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
  const normalizedQuery = normalize(searchQuery);
  if (!normalizedQuery) return true;
  const haystack = filterIndex.searchableTextByTaskId.get(taskId) ?? "";
  return haystack.includes(normalizedQuery);
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
  includedChannels: string[];
  excludedChannels: string[];
  channelMatchMode: ChannelMatchMode;
  taskPredicate?: (task: Task) => boolean;
}

export function filterTasksForView({
  allTasks,
  filterIndex,
  prefilteredTaskIds,
  focusedTaskId,
  includeFocusedTask = false,
  hideClosedTasks = false,
  searchQuery,
  people,
  includedChannels,
  excludedChannels,
  channelMatchMode,
  taskPredicate,
}: FilterTasksForViewParams): Task[] {
  const effectiveFilterIndex = filterIndex ?? buildTaskViewFilterIndex(allTasks, people);
  const descendantIds = focusedTaskId
    ? effectiveFilterIndex.descendantIdsByTaskId.get(focusedTaskId) ?? new Set<string>()
    : null;

  return allTasks.filter((task) => {
    const isExplicitlyFocusedTask =
      includeFocusedTask &&
      Boolean(focusedTaskId) &&
      task.id === focusedTaskId;

    if (taskPredicate && !taskPredicate(task)) return false;
    if (!prefilteredTaskIds.has(task.id)) return false;
    if (hideClosedTasks && task.status === "closed" && !isExplicitlyFocusedTask) return false;

    if (focusedTaskId) {
      if (task.id === focusedTaskId) {
        if (!includeFocusedTask) return false;
      } else if (!descendantIds?.has(task.id)) {
        return false;
      }
    }

    if (!taskMatchesSearchIndex(task.id, searchQuery, effectiveFilterIndex)) {
      return false;
    }

    return taskMatchesChannelIndex(
      task.id,
      includedChannels,
      excludedChannels,
      channelMatchMode,
      effectiveFilterIndex
    );
  });
}
