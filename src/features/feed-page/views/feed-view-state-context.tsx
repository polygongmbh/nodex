import { createContext, useContext, type PropsWithChildren } from "react";
import type { DisplayDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
export interface FeedViewState {
  currentView: ViewType;
  displayDepthMode: DisplayDepthMode;
  isSidebarFocused: boolean;
  /** Pre-gated: rawIsOnboardingOpen && !isAuthModalOpen */
  isOnboardingOpen: boolean;
  activeOnboardingStepId: string | null;
  isManageRouteActive: boolean;
  canCreateContent: boolean;
  profileCompletionPromptSignal: number;
}

const defaultState: FeedViewState = {
  currentView: "status",
  displayDepthMode: "1",
  isSidebarFocused: false,
  isOnboardingOpen: false,
  activeOnboardingStepId: null,
  isManageRouteActive: false,
  canCreateContent: false,
  profileCompletionPromptSignal: 0,
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
