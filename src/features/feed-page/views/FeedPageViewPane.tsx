import { Suspense, lazy } from "react";
import { TaskTree } from "@/components/tasks/TaskTree";
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

  switch (currentView) {
    case "tree":
      return <TaskTree {...viewModel} />;
    case "feed":
      return (
        <Suspense fallback={viewFallback}>
          <FeedView {...viewModel} />
        </Suspense>
      );
    case "kanban":
      return (
        <Suspense fallback={viewFallback}>
          <KanbanView {...viewModel} depthMode={kanbanDepthMode} />
        </Suspense>
      );
    case "calendar":
      return (
        <Suspense fallback={viewFallback}>
          <CalendarView {...viewModel} />
        </Suspense>
      );
    case "list":
      return (
        <Suspense fallback={viewFallback}>
          <ListView {...viewModel} depthMode={kanbanDepthMode} />
        </Suspense>
      );
    default:
      return <TaskTree {...viewModel} />;
  }
}
