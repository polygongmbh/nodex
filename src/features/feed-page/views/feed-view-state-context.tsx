import { createContext, useContext, type HTMLAttributes, type PropsWithChildren } from "react";
import type { KanbanDepthMode } from "@/components/tasks/DesktopSearchDock";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
export interface FeedViewState {
  currentView: ViewType;
  kanbanDepthMode: KanbanDepthMode;
  isSidebarFocused: boolean;
  /** Pre-gated: rawIsOnboardingOpen && !isAuthModalOpen */
  isOnboardingOpen: boolean;
  activeOnboardingStepId: string | null;
  isManageRouteActive: boolean;
  canCreateContent: boolean;
  profileCompletionPromptSignal: number;
  desktopSwipeHandlers: HTMLAttributes<HTMLDivElement>;
}

const defaultState: FeedViewState = {
  currentView: "feed",
  kanbanDepthMode: "leaves",
  isSidebarFocused: false,
  isOnboardingOpen: false,
  activeOnboardingStepId: null,
  isManageRouteActive: false,
  canCreateContent: false,
  profileCompletionPromptSignal: 0,
  desktopSwipeHandlers: {},
};

const FeedViewStateContext = createContext<FeedViewState>(defaultState);

interface FeedViewStateProviderProps extends PropsWithChildren {
  value: FeedViewState;
}

export function FeedViewStateProvider({ value, children }: FeedViewStateProviderProps) {
  return (
    <FeedViewStateContext.Provider value={value}>{children}</FeedViewStateContext.Provider>
  );
}

export function useFeedViewState(): FeedViewState {
  return useContext(FeedViewStateContext);
}
