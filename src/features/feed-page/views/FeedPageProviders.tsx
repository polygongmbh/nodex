import type { PropsWithChildren } from "react";
import { FeedSidebarControllerProvider, type FeedSidebarState } from "@/features/feed-page/controllers/feed-sidebar-controller-context";
import { FeedSidebarCommandsProvider, type FeedSidebarCommands } from "@/features/feed-page/controllers/feed-sidebar-commands-context";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import type { FeedInteractionBus } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedSurfaceProvider, type FeedSurfaceState } from "./feed-surface-context";
import { FeedTaskViewModelProvider, type FeedTaskViewModel } from "./feed-task-view-model-context";
import { FeedPageUiConfigProvider, type FeedPageUiConfig } from "./feed-page-ui-config";
import { FeedViewStateProvider, type FeedViewState } from "./feed-view-state-context";

interface FeedPageProvidersProps extends PropsWithChildren {
  interactionBus: FeedInteractionBus;
  uiConfig: FeedPageUiConfig;
  surfaceState: FeedSurfaceState;
  taskViewModel: FeedTaskViewModel;
  viewState: FeedViewState;
  sidebarCommands: FeedSidebarCommands;
  sidebarController?: FeedSidebarState;
}

export function FeedPageProviders({
  interactionBus,
  uiConfig,
  surfaceState,
  taskViewModel,
  viewState,
  sidebarCommands,
  sidebarController,
  children,
}: FeedPageProvidersProps) {
  const content = sidebarController
    ? <FeedSidebarControllerProvider value={sidebarController}>{children}</FeedSidebarControllerProvider>
    : children;

  return (
    <FeedInteractionProvider bus={interactionBus}>
      <FeedSidebarCommandsProvider value={sidebarCommands}>
        <FeedPageUiConfigProvider value={uiConfig}>
          <FeedSurfaceProvider value={surfaceState}>
            <FeedViewStateProvider value={viewState}>
              <FeedTaskViewModelProvider value={taskViewModel}>{content}</FeedTaskViewModelProvider>
            </FeedViewStateProvider>
          </FeedSurfaceProvider>
        </FeedPageUiConfigProvider>
      </FeedSidebarCommandsProvider>
    </FeedInteractionProvider>
  );
}
