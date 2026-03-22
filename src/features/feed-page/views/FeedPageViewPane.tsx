import { Suspense, lazy, type ReactNode } from "react";
import { TaskTree } from "@/components/tasks/TaskTree";
import { TaskViewStatusRow } from "@/components/tasks/TaskViewStatusRow";
import { type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import { useFeedTaskViewModel } from "./feed-task-view-model-context";

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

interface FeedPageViewPaneProps {
  currentView: ViewType;
  kanbanDepthMode: KanbanDepthMode;
  loadingLabel: string;
}

export function FeedPageViewPane({
  currentView,
  kanbanDepthMode,
  loadingLabel,
}: FeedPageViewPaneProps) {
  const viewModel = useFeedTaskViewModel();
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
      <div className="min-h-0 flex-1 overflow-hidden">{viewPane}</div>
    </div>
  );
}
