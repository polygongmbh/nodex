import { Suspense, lazy, type ReactNode, useMemo } from "react";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { StatusView } from "@/components/tasks/status/StatusView";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { isTaskPost } from "@/types";
import { filterTasksForView } from "@/domain/content/task-view-filtering";
import { useTaskViewSource } from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedViewState } from "./feed-view-state-context";
import { ViewLoadingFallback } from "./ViewLoadingFallback";
import { useIsHydrating } from "@/features/feed-page/stores/hydration-status-store";
import type { Post } from "@/types";

const FeedView = lazy(() =>
  import("@/components/tasks/FeedView").then((module) => ({ default: module.FeedView }))
);
const KanbanView = lazy(() =>
  import("@/components/tasks/KanbanView").then((module) => ({ default: module.KanbanView }))
);
const CalendarView = lazy(() =>
  import("@/components/tasks/CalendarView").then((module) => ({ default: module.CalendarView }))
);
const ListView = lazy(() =>
  import("@/components/tasks/ListView").then((module) => ({ default: module.ListView }))
);

export function DesktopViewsPane({
  posts,
  focusedTaskId,
}: {
  posts: Post[];
  focusedTaskId: string | null;
}) {
  const { currentView } = useFeedViewState();
  const isHydrating = useIsHydrating();
  const taskSource = useTaskViewSource({
    posts,
    focusedTaskId,
  });
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(taskSource.channels),
    [taskSource.channels]
  );
  const scopedTasks = useMemo(
    () =>
      filterTasksForView({
        source: {
          allTasks: taskSource.posts,
          filterIndex: taskSource.filterIndex,
          prefilteredTaskIds: taskSource.prefilteredTaskIds,
          people: taskSource.people,
        },
        scope: {
          focusedTaskId: taskSource.focusedTaskId,
          includeFocusedTask: currentView === "feed",
          hideClosedTasks: false,
        },
        criteria: {
          searchQuery: taskSource.searchQuery,
          quickFilters: taskSource.quickFilters,
          channels: {
            included,
            excluded,
            matchMode: taskSource.channelMatchMode,
          },
        },
      }),
    [
      excluded,
      included,
      currentView,
      taskSource.posts,
      taskSource.channelMatchMode,
      taskSource.filterIndex,
      taskSource.focusedTaskId,
      taskSource.people,
      taskSource.prefilteredTaskIds,
      taskSource.quickFilters,
      taskSource.searchQuery,
    ]
  );
  // Only the feed view surfaces non-task items (comments, offers, requests).
  // Other views render tasks only, so the empty-state overlay should appear
  // whenever no task-typed items match the current filters even if other
  // post types do.
  const shouldShowOverlay =
    currentView === "status"
      ? false
      : currentView === "feed"
        ? scopedTasks.length === 0
        : scopedTasks.every((task) => !isTaskPost(task));
  let viewPane: ReactNode;
  switch (currentView) {
    case "status":
      viewPane = <StatusView posts={posts} focusedTaskId={focusedTaskId} />;
      break;
    case "tree":
      viewPane = <TaskTree posts={posts} focusedTaskId={focusedTaskId} />;
      break;
    case "feed":
      viewPane = <FeedView posts={posts} focusedTaskId={focusedTaskId} />;
      break;
    case "kanban":
      viewPane = <KanbanView posts={posts} focusedTaskId={focusedTaskId} />;
      break;
    case "calendar":
      viewPane = <CalendarView posts={posts} focusedTaskId={focusedTaskId} />;
      break;
    case "list":
      viewPane = <ListView posts={posts} focusedTaskId={focusedTaskId} />;
      break;
    default:
      viewPane = <TaskTree posts={posts} focusedTaskId={focusedTaskId} />;
      break;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskViewStatusRow
        posts={posts}
        focusedTaskId={focusedTaskId}
        isHydrating={isHydrating}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<ViewLoadingFallback />}>{viewPane}</Suspense>
        {shouldShowOverlay ? (
          <FilteredEmptyState focusedTaskId={focusedTaskId} />
        ) : null}
      </div>
    </div>
  );
}
