import { createContext, useContext, type PropsWithChildren } from "react";
import type { Person } from "@/types";

export interface FeedViewInteractionModel {
  forceShowComposer: boolean;
  onFocusSidebar: () => void;
  onSignInClick: () => void;
  onHashtagClick: (tag: string) => void;
  onAuthorClick: (author: Person) => void;
  onClearChannelFilter: (id: string) => void;
  onClearPersonFilter: (id: string) => void;
}

const noop = () => {};

const defaultModel: FeedViewInteractionModel = {
  forceShowComposer: false,
  onFocusSidebar: noop,
  onSignInClick: noop,
  onHashtagClick: noop,
  onAuthorClick: noop,
  onClearChannelFilter: noop,
  onClearPersonFilter: noop,
};

const FeedViewInteractionContext = createContext<FeedViewInteractionModel>(defaultModel);

interface FeedViewInteractionProviderProps extends PropsWithChildren {
  value: FeedViewInteractionModel;
}

export function FeedViewInteractionProvider({ value, children }: FeedViewInteractionProviderProps) {
  return <FeedViewInteractionContext.Provider value={value}>{children}</FeedViewInteractionContext.Provider>;
}

export function useFeedViewInteractionModel(): FeedViewInteractionModel {
  return useContext(FeedViewInteractionContext);
}
