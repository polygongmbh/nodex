import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TreeTaskItem } from "@/components/tasks/TreeTaskItem";
import { TaskAuthorProfilesProvider } from "@/components/tasks/task-author-profiles-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { selectPeopleOwnedTasks } from "./status-filters";
import type { Task } from "@/types";

const MY_TASKS_LIMIT = 20;

interface StatusMyTasksTreeProps {
  contextTasks: Task[];
  allTasks: Task[];
  peopleScope: Set<string>;
  focusedTaskId: string | null;
}

/**
 * The left column of the status view: a flat, priority-sorted list of tasks
 * within the current scope that belong to the people scope (either selected
 * sidebar people, or the signed-in user as fallback). Tasks are not nested
 * under their parents — each owned task appears once, regardless of its
 * position in the hierarchy. Each row uses the tree display so the user can
 * expand it to reveal comments and subtasks, but everything starts folded.
 */
export function StatusMyTasksTree({ contextTasks, allTasks, peopleScope, focusedTaskId }: StatusMyTasksTreeProps) {
  const { t } = useTranslation("tasks");
  const { t: tShell } = useTranslation("shell");
  const { relays } = useFeedSurfaceState();
  const { currentUser, isInteractionBlocked = false, isPendingPublishTask } = useFeedTaskViewModel();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const activeRelays = useMemo(() => relays.filter((relay) => relay.isActive), [relays]);

  const childrenMap = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const priorityScores = useMemo(() => evaluateTaskPriorities(allTasks), [allTasks]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap, allTasks, taskById, priorityScores }),
    [allTasks, childrenMap, priorityScores, taskById]
  );

  const ownedTasks = useMemo(
    () => sortTasks(selectPeopleOwnedTasks({ contextTasks, peopleScope, focusedTaskId }), sortContext),
    [contextTasks, focusedTaskId, peopleScope, sortContext]
  );

  // Children are only consulted when the user expands a row; in that case we
  // hand TreeTaskItem the real task children so it can render them recursively.
  const getRevealedChildren = useCallback(
    (parentId: string): Task[] => sortTasks(childrenMap.get(parentId) || [], sortContext),
    [childrenMap, sortContext]
  );

  if (peopleScope.size === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {t("status.myTasks.signInPrompt", { defaultValue: "Sign in to see tasks assigned to you." })}
      </div>
    );
  }

  if (ownedTasks.length === 0) return null;

  const visibleTasks = ownedTasks.slice(0, MY_TASKS_LIMIT);
  const hiddenCount = ownedTasks.length - visibleTasks.length;

  return (
    <TaskAuthorProfilesProvider tasks={allTasks}>
      <div className="scrollbar-main-view h-full overflow-y-auto px-2 sm:px-3 py-3 space-y-1">
        {visibleTasks.map((task) => (
          <TreeTaskItem
            key={task.id}
            task={task}
            // Render each owned task as a leaf by default; expansion reveals
            // its real children via getMatchingChildrenFn / childrenMap.
            matchingChildren={[]}
            childrenMap={childrenMap}
            currentUser={currentUser}
            getMatchingChildrenFn={getRevealedChildren}
            initialFoldState="collapsed"
            activeRelays={activeRelays}
            isPendingPublishTask={isPendingPublishTask}
            isInteractionBlocked={isInteractionBlocked}
            sortContext={sortContext}
          />
        ))}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              void dispatchFeedInteraction({ type: "ui.view.change", view: "tree" });
            }}
            className="w-full rounded-md px-3 py-2 text-center text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {hiddenCount > 0
              ? t("status.viewMore", {
                  count: hiddenCount,
                  view: tShell("navigation.views.tree"),
                })
              : t("status.showView", {
                  view: tShell("navigation.views.tree"),
                })}
          </button>
        </div>
      </div>
    </TaskAuthorProfilesProvider>
  );
}
