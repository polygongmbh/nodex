import { Suspense, lazy, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FilteredEmptyState } from "@/components/tasks/FilteredEmptyState";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { getIncludedExcludedChannelNames } from "@/domain/content/channel-filtering";
import { filterTasksForView } from "@/domain/content/task-view-filtering";
import { useTaskViewSource } from "@/features/feed-page/controllers/use-task-view-states";
import { useFeedTaskViewModel } from "./feed-task-view-model-context";
import { useFeedViewState } from "./feed-view-state-context";

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

export function DesktopViewsPane() {
  const { t } = useTranslation();
  const { currentView, kanbanDepthMode } = useFeedViewState();
  const loadingLabel = t("app.loadingView");
  const viewModel = useFeedTaskViewModel();
  const taskSource = useTaskViewSource({
    tasks: viewModel.tasks,
    allTasks: viewModel.allTasks,
    focusedTaskId: viewModel.focusedTaskId,
  });
  const { included, excluded } = useMemo(
    () => getIncludedExcludedChannelNames(taskSource.channels),
    [taskSource.channels]
  );
  const scopedTasks = useMemo(
    () =>
      filterTasksForView({
        source: {
          allTasks: taskSource.allTasks,
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
      taskSource.allTasks,
      taskSource.channelMatchMode,
      taskSource.filterIndex,
      taskSource.focusedTaskId,
      taskSource.people,
      taskSource.prefilteredTaskIds,
      taskSource.quickFilters,
      taskSource.searchQuery,
    ]
  );
  const focusedTaskTitle = useMemo(
    () =>
      taskSource.focusedTaskId
        ? taskSource.taskById.get(taskSource.focusedTaskId)?.content ?? ""
        : "",
    [taskSource.focusedTaskId, taskSource.taskById]
  );
  const shouldShowOverlay = scopedTasks.length === 0;
  const viewFallback = (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {loadingLabel}
    </div>
  );

  let viewPane: ReactNode;
  switch (currentView) {
    case "tree":
      viewPane = <TaskTree {...viewModel} />;
      break;
    case "feed":
      viewPane = (
        <Suspense fallback={viewFallback}>
          <FeedView {...viewModel} />
        </Suspense>
      );
      break;
    case "kanban":
      viewPane = (
        <Suspense fallback={viewFallback}>
          <KanbanView {...viewModel} depthMode={kanbanDepthMode} />
        </Suspense>
      );
      break;
    case "calendar":
      viewPane = (
        <Suspense fallback={viewFallback}>
          <CalendarView {...viewModel} />
        </Suspense>
      );
      break;
    case "list":
      viewPane = (
        <Suspense fallback={viewFallback}>
          <ListView {...viewModel} depthMode={kanbanDepthMode} />
        </Suspense>
      );
      break;
    default:
      viewPane = <TaskTree {...viewModel} />;
      break;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskViewStatusRow
        allTasks={viewModel.allTasks}
        focusedTaskId={viewModel.focusedTaskId}
        isHydrating={viewModel.isHydrating}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {viewPane}
        {shouldShowOverlay ? (
          <FilteredEmptyState
            isHydrating={viewModel.isHydrating}
            contextTaskTitle={focusedTaskTitle}
          />
        ) : null}
      </div>
    </div>
  );
}
