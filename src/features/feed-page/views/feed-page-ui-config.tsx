import { createContext, useContext, type PropsWithChildren } from "react";

export interface FeedPageUiConfig {
  completionSoundEnabled: boolean;
  onToggleCompletionSound: () => void;
}

const defaultUiConfig: FeedPageUiConfig = {
  completionSoundEnabled: true,
  onToggleCompletionSound: () => {},
};

const FeedPageUiConfigContext = createContext<FeedPageUiConfig>(defaultUiConfig);

interface FeedPageUiConfigProviderProps extends PropsWithChildren {
  value: FeedPageUiConfig;
}

export function FeedPageUiConfigProvider({ value, children }: FeedPageUiConfigProviderProps) {
  return <FeedPageUiConfigContext.Provider value={value}>{children}</FeedPageUiConfigContext.Provider>;
}

export function useFeedPageUiConfig(): FeedPageUiConfig {
  return useContext(FeedPageUiConfigContext);
}
