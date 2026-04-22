import { createContext, useContext, type PropsWithChildren } from "react";
import type {
  PostType,
  TaskStatus,
  TaskDateType,
  TaskInitialStatus,
  PublishedAttachment,
  Nip99Metadata,
  Nip99ListingStatus,
} from "@/types";

export interface FeedTaskCommands {
  focusTask(taskId: string | null): void;
  createTask(
    content: string,
    tags: string[],
    relays: string[],
    taskType: PostType,
    dueDate?: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    focusedTaskId?: string | null,
    initialStatus?: TaskInitialStatus,
    explicitMentionPubkeys?: string[],
    mentionIdentifiers?: string[],
    priority?: number,
    attachments?: PublishedAttachment[],
    nip99?: Nip99Metadata,
    locationGeohash?: string
  ): Promise<TaskCreateResult>;
  toggleComplete(taskId: string): void;
  changeStatus(taskId: string, status: TaskStatus): void;
  updateDueDate(taskId: string, dueDate?: Date, dueTime?: string, dateType?: TaskDateType): void;
  updatePriority(taskId: string, priority: number): void;
  changeListingStatus(taskId: string, status: Nip99ListingStatus): void;
  undoPendingPublish(taskId: string): void;
  retryFailedPublish(draftId: string): void;
  repostFailedPublish(draftId: string): void;
  dismissFailedPublish(draftId: string): void;
  dismissAllFailedPublish(): void;
}

const defaultCommands: FeedTaskCommands = {
  focusTask: () => {},
  createTask: async () => {},
  toggleComplete: () => {},
  changeStatus: () => {},
  updateDueDate: () => {},
  updatePriority: () => {},
  changeListingStatus: () => {},
  undoPendingPublish: () => {},
  retryFailedPublish: () => {},
  repostFailedPublish: () => {},
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
