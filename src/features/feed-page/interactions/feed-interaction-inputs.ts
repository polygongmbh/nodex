import type {
  ChannelMatchMode,
  TaskState,
  TaskDateType,
  Nip99ListingStatus,
} from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";
import type { DisplayDepthMode } from "./feed-interaction-intent";

/**
 * Command contracts the interaction bus consumes as plain inputs.
 *
 * These were React contexts whose only consumer was the bus itself —
 * prop-drilling laundered through context. They are produced in Index and
 * handed straight to FeedInteractionBusProvider as props. See
 * plans/243-feedsidebarcommandsprovider-proud-swan.md.
 */

export interface FeedSidebarCommands {
  // Channel pin/unpin
  pinChannel(channelId: string): void;
  unpinChannel(channelId: string): void;
  // Channel filter
  toggleChannel(channelId: string): void;
  showOnlyChannel(channelId: string): void;
  toggleAllChannels(): void;
  setChannelMatchMode(mode: ChannelMatchMode): void;
  // Person pin/unpin
  pinPerson(personId: string): void;
  unpinPerson(personId: string): void;
  // Person filter
  togglePerson(personId: string): void;
  showOnlyPerson(personId: string): void;
  toggleAllPeople(): void;
  // Relay
  selectRelay(relayId: string, mode: "toggle" | "exclusive"): void;
  toggleRelay(relayId: string): void;
  showOnlyRelay(relayId: string): void;
  toggleAllRelays(): void;
  addRelay(url: string): void;
  reorderRelays(orderedUrls: string[]): void;
  removeRelay(url: string): void;
  reconnectRelay(url: string, options?: { forceNewSocket?: boolean }): void;
  // Saved filters
  applySavedFilter(configurationId: string): void;
  saveCurrentFilter(name: string): void;
  renameSavedFilter(configurationId: string, name: string): void;
  deleteSavedFilter(configurationId: string): void;
}

export interface FeedViewCommands {
  focusSidebar(): void;
  focusTasks(): void;
  setCurrentView(view: ViewType): void;
  setDisplayDepthMode(mode: DisplayDepthMode): void;
}

/**
 * Failed-publish queue commands. Bus-only: dispatched from the queue banner /
 * mobile bottom bar via `publish.failed.*` intents, no component reads them
 * directly. Peeled off FeedTaskCommands, which still has component consumers.
 */
export interface FailedPublishCommands {
  retryFailedPublish(draftId: string): Promise<void>;
  repostFailedPublish(draftId: string): Promise<void>;
  editFailedPublish(draftId: string): void;
  dismissFailedPublish(draftId: string): void;
  dismissAllFailedPublish(): void;
}

/**
 * Task lifecycle/editing commands the bus dispatches via `task.*` intents. None
 * are read by a component — `createTask` is the only task command with direct
 * consumers and stays in the FeedTaskCommands context.
 */
export interface TaskInteractionCommands {
  focusTask(taskId: string | null, view?: ViewType): void;
  toggleComplete(taskId: string): void;
  changeStatus(taskId: string, status: TaskState): void;
  updateDueDate(taskId: string, dueDate?: Date, dueTime?: string, dateType?: TaskDateType): void;
  updatePriority(taskId: string, priority: number): void;
  changeListingStatus(taskId: string, status: Nip99ListingStatus): void;
  deletePost(taskId: string): Promise<boolean>;
  recomposePost(taskId: string): void;
  copyPermalink(taskId: string): Promise<boolean>;
  undoPendingPublish(taskId: string): void;
}
