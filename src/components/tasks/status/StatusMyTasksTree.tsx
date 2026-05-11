import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TreeTaskItem } from "@/components/tasks/TreeTaskItem";
import { TaskAuthorProfilesProvider } from "@/components/tasks/task-author-profiles-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { selectPeopleOwnedTasks } from "./status-filters";
import type { Task } from "@/types";

interface StatusMyTasksTreeProps {
  scopedTasks: Task[];
  allTasks: Task[];
  peopleScope: Set<string>;
}

/**
 * The middle column of the status view: a tree of tasks within the current
 * scope that belong to the people scope (either selected sidebar people, or
 * the signed-in user as fallback). The visible tree is the owned-subgraph —
 * roots are owned tasks whose parent is not also owned.
 */
export function StatusMyTasksTree({ scopedTasks, allTasks, peopleScope }: StatusMyTasksTreeProps) {
  const { t } = useTranslation("tasks");
  const { relays } = useFeedSurfaceState();
  const { currentUser, isInteractionBlocked = false, isPendingPublishTask } = useFeedTaskViewModel();
  const activeRelays = useMemo(() => relays.filter((relay) => relay.isActive), [relays]);

  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const priorityScores = useMemo(() => evaluateTaskPriorities(allTasks), [allTasks]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap, allTasks, taskById, priorityScores }),
    [allTasks, childrenMap, priorityScores, taskById]
  );

  const ownedTasks = useMemo(
    () => selectPeopleOwnedTasks({ scopedTasks, peopleScope }),
    [scopedTasks, peopleScope]
  );
  const ownedIds = useMemo(() => new Set(ownedTasks.map((task) => task.id)), [ownedTasks]);

  const ownedRoots = useMemo(() => {
    const roots = ownedTasks.filter((task) => !task.parentId || !ownedIds.has(task.parentId));
    return sortTasks(roots, sortContext);
  }, [ownedTasks, ownedIds, sortContext]);

  const getMatchingChildren = useCallback(
    (parentId: string): Task[] => {
      const children = (childrenMap.get(parentId) || []).filter((child) => ownedIds.has(child.id));
      return sortTasks(children, sortContext);
    },
    [childrenMap, ownedIds, sortContext]
  );

  if (peopleScope.size === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {t("status.myTasks.signInPrompt", { defaultValue: "Sign in to see tasks assigned to you." })}
      </div>
    );
  }

  if (ownedRoots.length === 0) return null;

  return (
    <TaskAuthorProfilesProvider tasks={allTasks}>
      <div className="scrollbar-main-view h-full overflow-y-auto px-2 sm:px-3 py-3 space-y-1">
        {ownedRoots.map((task) => (
          <TreeTaskItem
            key={task.id}
            task={task}
            matchingChildren={getMatchingChildren(task.id)}
            childrenMap={childrenMap}
            currentUser={currentUser}
            matchedByFilter
            getMatchingChildrenFn={getMatchingChildren}
            hasMatchingFilters
            activeRelays={activeRelays}
            isPendingPublishTask={isPendingPublishTask}
            isInteractionBlocked={isInteractionBlocked}
            sortContext={sortContext}
          />
        ))}
      </div>
    </TaskAuthorProfilesProvider>
  );
}
