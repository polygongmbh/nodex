import { createContext, useContext, type PropsWithChildren } from "react";
import type {
  Nip99ListingStatus,
  Person,
  SharedTaskViewContext,
  TaskDateType,
  TaskStatus,
} from "@/types";

export interface FeedTaskViewModel extends SharedTaskViewContext {
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onListingStatusChange?: (taskId: string, status: Nip99ListingStatus) => void;
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
  onInteractionBlocked?: () => void;
  onAuthorClick?: (author: Person) => void;
  isHydrating?: boolean;
}

const noop = () => {};
const defaultModel: FeedTaskViewModel = {
  tasks: [],
  allTasks: [],
  relays: [],
  channels: [],
  composeChannels: [],
  people: [],
  searchQuery: "",
  onSearchChange: noop,
  onNewTask: async () => ({ ok: false, reason: "unexpected-error" }),
  onToggleComplete: noop,
  onFocusTask: noop,
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
