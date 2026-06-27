import { createContext, useContext, type PropsWithChildren } from "react";
export interface FeedViewState {
  isSidebarFocused: boolean;
  /** Pre-gated: rawIsOnboardingOpen && !isAuthModalOpen */
  isOnboardingOpen: boolean;
  activeOnboardingStepId: string | null;
}

const defaultState: FeedViewState = {
  isSidebarFocused: false,
  isOnboardingOpen: false,
  activeOnboardingStepId: null,
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
