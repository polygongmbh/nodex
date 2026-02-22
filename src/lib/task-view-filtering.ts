import { taskMatchesTextQuery } from "@/lib/task-text-filter";
import { taskMatchesChannelFilters } from "@/lib/channel-filtering";
import type { ChannelMatchMode, Person, Task } from "@/types";

export function getDescendantTaskIds(allTasks: Task[], rootTaskId: string): Set<string> {
  const childrenByParentId = new Map<string, string[]>();
  for (const task of allTasks) {
    if (!task.parentId) continue;
    const children = childrenByParentId.get(task.parentId);
    if (children) {
      children.push(task.id);
      continue;
    }
    childrenByParentId.set(task.parentId, [task.id]);
  }

  const descendants = new Set<string>();
  const queue: string[] = [rootTaskId];
  const visited = new Set<string>([rootTaskId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const children = childrenByParentId.get(current) || [];

    for (const childId of children) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      descendants.add(childId);
      queue.push(childId);
    }
  }

  return descendants;
}

interface FilterTasksForViewParams {
  allTasks: Task[];
  prefilteredTaskIds: Set<string>;
  focusedTaskId?: string | null;
  includeFocusedTask?: boolean;
  searchQuery: string;
  people: Person[];
  includedChannels: string[];
  excludedChannels: string[];
  channelMatchMode: ChannelMatchMode;
  taskPredicate?: (task: Task) => boolean;
}

export function filterTasksForView({
  allTasks,
  prefilteredTaskIds,
  focusedTaskId,
  includeFocusedTask = false,
  searchQuery,
  people,
  includedChannels,
  excludedChannels,
  channelMatchMode,
  taskPredicate,
}: FilterTasksForViewParams): Task[] {
  const descendantIds = focusedTaskId ? getDescendantTaskIds(allTasks, focusedTaskId) : null;

  return allTasks.filter((task) => {
    if (taskPredicate && !taskPredicate(task)) return false;
    if (!prefilteredTaskIds.has(task.id)) return false;

    if (focusedTaskId) {
      if (task.id === focusedTaskId) {
        if (!includeFocusedTask) return false;
      } else if (!descendantIds?.has(task.id)) {
        return false;
      }
    }

    if (!taskMatchesTextQuery(task, searchQuery, people)) {
      return false;
    }

    return taskMatchesChannelFilters(
      task.tags,
      includedChannels,
      excludedChannels,
      channelMatchMode
    );
  });
}
