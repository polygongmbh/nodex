import { Suspense, lazy } from "react";
import { TaskTree } from "@/components/tasks/TaskTree";
import { type KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type {
  Nip99ListingStatus,
  Person,
  SharedTaskViewContext,
  TaskDateType,
  TaskStatus,
} from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

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

interface FeedPageTaskViewProps extends SharedTaskViewContext {
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onListingStatusChange?: (taskId: string, status: Nip99ListingStatus) => void;
  onFocusSidebar?: () => void;
  onSignInClick?: () => void;
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  onUndoPendingPublish?: (taskId: string) => void;
  isPendingPublishTask?: (taskId: string) => boolean;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  onUpdateDueDate?: (
    taskId: string,
    dueDate: Date | undefined,
    dueTime?: string,
    dateType?: TaskDateType
  ) => void;
  onUpdatePriority?: (taskId: string, priority: number) => void;
  isInteractionBlocked?: boolean;
  onAuthorClick?: (author: Person) => void;
  isHydrating?: boolean;
}

interface FeedPageViewPaneProps {
  currentView: ViewType;
  kanbanDepthMode: KanbanDepthMode;
  loadingLabel: string;
  viewProps: FeedPageTaskViewProps;
}

export function FeedPageViewPane({
  currentView,
  kanbanDepthMode,
  loadingLabel,
  viewProps,
}: FeedPageViewPaneProps) {
  const viewFallback = (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {loadingLabel}
    </div>
  );

  switch (currentView) {
    case "tree":
      return <TaskTree {...viewProps} />;
    case "feed":
      return (
        <Suspense fallback={viewFallback}>
          <FeedView {...viewProps} />
        </Suspense>
      );
    case "kanban":
      return (
        <Suspense fallback={viewFallback}>
          <KanbanView {...viewProps} depthMode={kanbanDepthMode} />
        </Suspense>
      );
    case "calendar":
      return (
        <Suspense fallback={viewFallback}>
          <CalendarView {...viewProps} />
        </Suspense>
      );
    case "list":
      return (
        <Suspense fallback={viewFallback}>
          <ListView {...viewProps} depthMode={kanbanDepthMode} />
        </Suspense>
      );
    default:
      return <TaskTree {...viewProps} />;
  }
}
