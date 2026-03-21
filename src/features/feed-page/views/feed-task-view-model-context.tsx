import { createContext, useContext, type PropsWithChildren } from "react";
import type {
  SharedTaskViewContext,
} from "@/types";

export interface FeedTaskViewModel extends SharedTaskViewContext {
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  isPendingPublishTask?: (taskId: string) => boolean;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  isInteractionBlocked?: boolean;
  onInteractionBlocked?: () => void;
  isHydrating?: boolean;
}

const defaultModel: FeedTaskViewModel = {
  tasks: [],
  allTasks: [],
  relays: [],
  channels: [],
  composeChannels: [],
  people: [],
  searchQuery: "",
  onNewTask: async () => ({ ok: false, reason: "unexpected-error" }),
};

const FeedTaskViewModelContext = createContext<FeedTaskViewModel>(defaultModel);

interface FeedTaskViewModelProviderProps extends PropsWithChildren {
  value: FeedTaskViewModel;
}

export function FeedTaskViewModelProvider({ value, children }: FeedTaskViewModelProviderProps) {
  return <FeedTaskViewModelContext.Provider value={value}>{children}</FeedTaskViewModelContext.Provider>;
}

export function useFeedTaskViewModel(): FeedTaskViewModel {
  return useContext(FeedTaskViewModelContext);
}
