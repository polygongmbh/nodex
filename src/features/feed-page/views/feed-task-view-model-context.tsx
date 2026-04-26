import { createContext, useContext, type PropsWithChildren } from "react";
import type {
  SharedTaskViewContext,
} from "@/types";

export interface FeedTaskViewModel extends SharedTaskViewContext {
  forceShowComposer?: boolean;
  composeGuideActivationSignal?: number;
  isPendingPublishTask?: (taskId: string) => boolean;
  onMentionRequestConsumed?: (requestId: number) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  isInteractionBlocked?: boolean;
  /**
   * Surfaces a toast (and may open the auth modal) when a soft-disabled
   * control is tapped while the user can't perform the action. Typically
   * provided by `useTaskPublishControls`.
   */
  onBlockedInteractionAttempt?: () => void;
  isHydrating?: boolean;
}

const defaultModel: FeedTaskViewModel = {
  tasks: [],
  allTasks: [],
  focusedTaskId: null,
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
