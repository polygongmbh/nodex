import { createContext, useContext, type PropsWithChildren } from "react";
import type {
  ComposeRecomposeOf,
  PostType,
  TaskDateType,
  TaskState,
  PublishedAttachment,
  Nip99Metadata,
  Nip99ListingStatus,
  TaskCreateResult,
} from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

export interface FeedTaskCommands {
  focusTask(taskId: string | null, view?: ViewType): void;
  createTask(
    content: string,
    tags: string[],
    relays: string[],
    taskType: PostType,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    focusedTaskId?: string | null,
    initialState?: TaskState,
    explicitMentionPubkeys?: string[],
    mentionIdentifiers?: string[],
    priority?: number,
    attachments?: PublishedAttachment[],
    nip99?: Nip99Metadata,
    locationGeohash?: string,
    recomposeOf?: ComposeRecomposeOf,
  ): Promise<TaskCreateResult>;
  toggleComplete(taskId: string): void;
  changeStatus(taskId: string, status: TaskState): void;
  updateDueDate(taskId: string, dueDate?: Date, dueTime?: string, dateType?: TaskDateType): void;
  updatePriority(taskId: string, priority: number): void;
  changeListingStatus(taskId: string, status: Nip99ListingStatus): void;
  deletePost(taskId: string): Promise<boolean>;
  recomposePost(taskId: string): void;
  copyPermalink(taskId: string): Promise<boolean>;
  undoPendingPublish(taskId: string): void;
  retryFailedPublish(draftId: string): Promise<void>;
  repostFailedPublish(draftId: string): Promise<void>;
  dismissFailedPublish(draftId: string): void;
  dismissAllFailedPublish(): void;
}

const defaultCommands: FeedTaskCommands = {
  focusTask: () => {},
  createTask: async () => ({ ok: false, reason: "unexpected-error" }),
  toggleComplete: () => {},
  changeStatus: () => {},
  updateDueDate: () => {},
  updatePriority: () => {},
  changeListingStatus: () => {},
  deletePost: async () => false,
  recomposePost: () => {},
  copyPermalink: async () => false,
  undoPendingPublish: () => {},
  retryFailedPublish: async () => {},
  repostFailedPublish: async () => {},
  dismissFailedPublish: () => {},
  dismissAllFailedPublish: () => {},
};

const FeedTaskCommandsContext = createContext<FeedTaskCommands>(defaultCommands);

interface FeedTaskCommandsProviderProps extends PropsWithChildren {
  value: FeedTaskCommands;
}

export function FeedTaskCommandsProvider({ value, children }: FeedTaskCommandsProviderProps) {
  return (
    <FeedTaskCommandsContext.Provider value={value}>
      {children}
    </FeedTaskCommandsContext.Provider>
  );
}

export function useFeedTaskCommands(): FeedTaskCommands {
  return useContext(FeedTaskCommandsContext);
}
