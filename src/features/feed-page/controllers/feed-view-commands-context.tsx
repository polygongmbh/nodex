import { createContext, useContext, type PropsWithChildren } from "react";
import type { DisplayDepthMode } from "@/features/feed-page/interactions/feed-interaction-intent";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

export interface FeedViewCommands {
  focusSidebar(): void;
  focusTasks(): void;
  setCurrentView(view: ViewType): void;
  setSearchQuery(query: string): void;
  setDisplayDepthMode(mode: DisplayDepthMode): void;
  setManageRouteActive(isActive: boolean): void;
}

const defaultCommands: FeedViewCommands = {
  focusSidebar: () => {},
  focusTasks: () => {},
  setCurrentView: () => {},
  setSearchQuery: () => {},
  setDisplayDepthMode: () => {},
  setManageRouteActive: () => {},
};

const FeedViewCommandsContext = createContext<FeedViewCommands>(defaultCommands);

interface FeedViewCommandsProviderProps extends PropsWithChildren {
  value: FeedViewCommands;
}

export function FeedViewCommandsProvider({ value, children }: FeedViewCommandsProviderProps) {
  return (
    <FeedViewCommandsContext.Provider value={value}>
      {children}
    </FeedViewCommandsContext.Provider>
  );
}

export function useFeedViewCommands(): FeedViewCommands {
  return useContext(FeedViewCommandsContext);
}
