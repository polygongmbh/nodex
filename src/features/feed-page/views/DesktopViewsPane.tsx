import { Suspense, lazy, type ReactNode, useMemo } from "react";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { StatusView } from "@/components/tasks/status/StatusView";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { isTaskPost } from "@/types";
import { buildTaskViewFilterIndex, filterTasksForView } from "@/domain/content/task-view-filtering";
import { useFeedSurfaceState } from "./feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useFeedViewState } from "./feed-view-state-context";
import { ViewLoadingFallback } from "./ViewLoadingFallback";
import { useIsHydrating } from "@/features/feed-page/stores/hydration-status-store";
import type { Post } from "@/types";

const HomeView = lazy(() =>
  import("@/components/tasks/home/HomeView").then((module) => ({ default: module.HomeView }))
);
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
  const { channels, people, quickFilters } = useFeedSurfaceState();
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const filterIndex = useMemo(() => buildTaskViewFilterIndex(posts, people), [posts, people]);
  const prefilteredTaskIds = useMemo(() => new Set(posts.map((task) => task.id)), [posts]);
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(channels),
    [channels]
  );
  const scopedTasks = useMemo(
    () =>
      filterTasksForView({
        source: {
          allTasks: posts,
          filterIndex,
          prefilteredTaskIds,
          people,
          selectedPubkeys,
        },
        scope: {
          focusedTaskId,
          includeFocusedTask: currentView === "feed",
          hideClosedTasks: false,
        },
        criteria: {
          searchQuery,
          quickFilters,
          channels: {
            included,
            excluded,
            matchMode: channelMatchMode,
          },
        },
      }),
    [
      excluded,
      included,
      currentView,
      posts,
      channelMatchMode,
      filterIndex,
      focusedTaskId,
      people,
      selectedPubkeys,
      prefilteredTaskIds,
      quickFilters,
      searchQuery,
    ]
  );
  // Only the feed view surfaces non-task items (comments, offers, requests).
  // Other views render tasks only, so the empty-state overlay should appear
  // whenever no task-typed items match the current filters even if other
  // post types do. Status and home bring their own empty states.
  const shouldShowOverlay =
    currentView === "status" || currentView === "home"
      ? false
      : currentView === "feed"
        ? scopedTasks.length === 0
        : scopedTasks.every((task) => !isTaskPost(task));
  let viewPane: ReactNode;
  switch (currentView) {
    case "home":
      viewPane = <HomeView posts={posts} focusedTaskId={focusedTaskId} />;
      break;
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
        // In the home view the sidebar's Projects section indicates the
        // current position instead of the breadcrumb bar.
        focusedTaskId={currentView === "home" ? null : focusedTaskId}
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
