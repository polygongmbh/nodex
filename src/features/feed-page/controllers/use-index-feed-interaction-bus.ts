import { useMemo } from "react";
import { createFeedInteractionMiddlewareSkeleton } from "@/features/feed-page/interactions/feed-interaction-middleware-skeleton";
import {
  createFeedInteractionBus,
  type FeedInteractionBus,
  type FeedInteractionEffect,
  type FeedInteractionHandlerMap,
  type FeedInteractionPipelineApi,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import type { FeedSidebarCommands } from "./feed-sidebar-commands-context";

interface UseIndexFeedInteractionBusOptions {
  handleOpenAuthModal: (initialStep?: "choose" | "noas" | "noasSignUp") => void;
  openShortcutsHelp: () => void;
  handleOpenGuide: () => void;
  handleFocusSidebar: () => void;
  handleFocusTasks: () => void;
  guardInteraction: (mode: "create" | "modify") => boolean;
  setCurrentView: (view: "tree" | "feed" | "kanban" | "calendar" | "list") => void;
  setSearchQuery: (query: string) => void;
  setKanbanDepthMode: (mode: "1" | "2" | "3" | "all" | "leaves" | "projects") => void;
  setManageRouteActive: (isActive: boolean) => void;
  filterHandlers: FeedInteractionHandlerMap;
  handleRelaySelectIntent: (relayId: string, mode: "toggle" | "exclusive") => string | null;
  handleRelayToggle: (relayId: string) => void;
  handleRelayExclusive: (relayId: string) => void;
  handleToggleAllRelays: () => void;
  handleAddRelay: (url: string) => void;
  reorderRelays: (orderedUrls: string[]) => void;
  handleRemoveRelay: (url: string) => void;
  reconnectRelay: (url: string) => void;
  sidebarCommands: FeedSidebarCommands;
  savedFilterController: {
    onApplyConfiguration: (configurationId: string) => void;
    onSaveCurrentConfiguration: (name: string) => void;
    onRenameConfiguration: (configurationId: string, name: string) => void;
    onDeleteConfiguration: (configurationId: string) => void;
  };
  setFocusedTaskId: (taskId: string | null) => void;
  handleNewTask: (
    content: string,
    tags: string[],
    relays: string[],
    taskType: import("@/types").PostType,
    dueDate?: Date,
    dueTime?: string,
    dateType?: import("@/types").TaskDateType,
    focusedTaskId?: string | null,
    initialStatus?: import("@/types").TaskInitialStatus,
    explicitMentionPubkeys?: string[],
    mentionIdentifiers?: string[],
    priority?: number,
    attachments?: import("@/types").PublishedAttachment[],
    nip99?: import("@/types").Nip99Metadata,
    locationGeohash?: string
  ) => Promise<void>;
  handleToggleComplete: (taskId: string) => void;
  handleStatusChange: (taskId: string, status: import("@/types").TaskStatus) => void;
  handleDueDateChange: (
    taskId: string,
    dueDate?: Date,
    dueTime?: string,
    dateType?: import("@/types").TaskDateType
  ) => void;
  handlePriorityChange: (taskId: string, priority: number) => void;
  handleListingStatusChange: (taskId: string, status: import("@/types").Nip99ListingStatus) => void;
  handleUndoPendingPublish: (taskId: string) => void;
  handleRetryFailedPublish: (draftId: string) => void;
  handleRepostFailedPublish: (draftId: string) => void;
  handleDismissFailedPublish: (draftId: string) => void;
  handleDismissAllFailedPublish: () => void;
  interactionEffects: FeedInteractionEffect[];
}

export function useIndexFeedInteractionBus({
  handleOpenAuthModal,
  openShortcutsHelp,
  handleOpenGuide,
  handleFocusSidebar,
  handleFocusTasks,
  guardInteraction,
  setCurrentView,
  setSearchQuery,
  setKanbanDepthMode,
  setManageRouteActive,
  filterHandlers,
  handleRelaySelectIntent,
  handleRelayToggle,
  handleRelayExclusive,
  handleToggleAllRelays,
  handleAddRelay,
  reorderRelays,
  handleRemoveRelay,
  reconnectRelay,
  sidebarCommands,
  savedFilterController,
  setFocusedTaskId,
  handleNewTask,
  handleToggleComplete,
  handleStatusChange,
  handleDueDateChange,
  handlePriorityChange,
  handleListingStatusChange,
  handleUndoPendingPublish,
  handleRetryFailedPublish,
  handleRepostFailedPublish,
  handleDismissFailedPublish,
  handleDismissAllFailedPublish,
  interactionEffects,
}: UseIndexFeedInteractionBusOptions): FeedInteractionBus {
  const handlers: FeedInteractionHandlerMap = useMemo(
    () => ({
      "ui.openAuthModal": (intent) => {
        if (
          intent.initialStep === "choose" ||
          intent.initialStep === "noas" ||
          intent.initialStep === "noasSignUp"
        ) {
          handleOpenAuthModal(intent.initialStep);
          return;
        }
        handleOpenAuthModal();
      },
      "ui.openShortcutsHelp": () => {
        openShortcutsHelp();
      },
      "ui.openGuide": () => {
        handleOpenGuide();
      },
      "ui.focusSidebar": () => {
        handleFocusSidebar();
      },
      "ui.focusTasks": () => {
        handleFocusTasks();
      },
      "ui.interaction.guardModify": () => {
        guardInteraction("modify");
      },
      "ui.view.change": (intent) => {
        setCurrentView(intent.view);
      },
      "ui.search.change": (intent) => {
        setSearchQuery(intent.query);
      },
      "ui.kanbanDepth.change": (intent) => {
        setKanbanDepthMode(intent.mode);
      },
      "ui.manageRoute.change": (intent) => {
        setManageRouteActive(intent.isActive);
      },
      ...filterHandlers,
      "sidebar.relay.select": (intent, api: FeedInteractionPipelineApi) => {
        const reconnectRelayUrl = handleRelaySelectIntent(intent.relayId, intent.mode);
        if (reconnectRelayUrl) {
          return api.dispatch({
            type: "sidebar.relay.reconnect",
            url: reconnectRelayUrl,
          });
        }
      },
      "sidebar.relay.toggle": (intent) => {
        handleRelayToggle(intent.relayId);
      },
      "sidebar.relay.exclusive": (intent) => {
        handleRelayExclusive(intent.relayId);
      },
      "sidebar.relay.toggleAll": () => {
        handleToggleAllRelays();
      },
      "sidebar.relay.add": (intent) => {
        handleAddRelay(intent.url);
      },
      "sidebar.relay.reorder": (intent) => {
        reorderRelays(intent.orderedUrls);
      },
      "sidebar.relay.remove": (intent) => {
        handleRemoveRelay(intent.url);
      },
      "sidebar.relay.reconnect": (intent) => {
        reconnectRelay(intent.url);
      },
      "sidebar.channel.pin": (intent) => {
        sidebarCommands.pinChannel(intent.channelId);
      },
      "sidebar.channel.unpin": (intent) => {
        sidebarCommands.unpinChannel(intent.channelId);
      },
      "sidebar.person.pin": (intent) => {
        sidebarCommands.pinPerson(intent.personId);
      },
      "sidebar.person.unpin": (intent) => {
        sidebarCommands.unpinPerson(intent.personId);
      },
      "sidebar.savedFilter.apply": (intent) => {
        savedFilterController.onApplyConfiguration(intent.configurationId);
      },
      "sidebar.savedFilter.saveCurrent": (intent) => {
        savedFilterController.onSaveCurrentConfiguration(intent.name);
      },
      "sidebar.savedFilter.rename": (intent) => {
        savedFilterController.onRenameConfiguration(intent.configurationId, intent.name);
      },
      "sidebar.savedFilter.delete": (intent) => {
        savedFilterController.onDeleteConfiguration(intent.configurationId);
      },
      "task.focus.change": (intent) => {
        setFocusedTaskId(intent.taskId);
      },
      "task.create": (intent) => {
        return handleNewTask(
          intent.content,
          intent.tags,
          intent.relays,
          intent.taskType,
          intent.dueDate,
          intent.dueTime,
          intent.dateType,
          intent.focusedTaskId,
          intent.initialStatus,
          intent.explicitMentionPubkeys,
          intent.mentionIdentifiers,
          intent.priority,
          intent.attachments,
          intent.nip99,
          intent.locationGeohash
        );
      },
      "task.toggleComplete": (intent) => {
        handleToggleComplete(intent.taskId);
      },
      "task.changeStatus": (intent) => {
        handleStatusChange(intent.taskId, intent.status);
      },
      "task.updateDueDate": (intent) => {
        handleDueDateChange(intent.taskId, intent.dueDate, intent.dueTime, intent.dateType);
      },
      "task.updatePriority": (intent) => {
        handlePriorityChange(intent.taskId, intent.priority);
      },
      "task.listingStatus.change": (intent) => {
        handleListingStatusChange(intent.taskId, intent.status);
      },
      "task.undoPendingPublish": (intent) => {
        handleUndoPendingPublish(intent.taskId);
      },
      "publish.failed.retry": (intent) => {
        handleRetryFailedPublish(intent.draftId);
      },
      "publish.failed.repost": (intent) => {
        handleRepostFailedPublish(intent.draftId);
      },
      "publish.failed.dismiss": (intent) => {
        handleDismissFailedPublish(intent.draftId);
      },
      "publish.failed.dismissAll": () => {
        handleDismissAllFailedPublish();
      },
    }),
    [
      filterHandlers,
      guardInteraction,
      handleAddRelay,
      handleDismissAllFailedPublish,
      handleDismissFailedPublish,
      handleDueDateChange,
      handleFocusSidebar,
      handleFocusTasks,
      handleListingStatusChange,
      handleNewTask,
      handleOpenAuthModal,
      handleOpenGuide,
      handlePriorityChange,
      handleRelayExclusive,
      handleRelaySelectIntent,
      handleRelayToggle,
      handleRemoveRelay,
      handleRepostFailedPublish,
      handleRetryFailedPublish,
      handleStatusChange,
      handleToggleAllRelays,
      handleToggleComplete,
      handleUndoPendingPublish,
      openShortcutsHelp,
      reconnectRelay,
      reorderRelays,
      savedFilterController,
      sidebarCommands,
      setCurrentView,
      setFocusedTaskId,
      setKanbanDepthMode,
      setManageRouteActive,
      setSearchQuery,
    ]
  );

  return useMemo(
    () =>
      createFeedInteractionBus({
        middlewares: createFeedInteractionMiddlewareSkeleton(),
        handlers,
        effects: interactionEffects,
      }),
    [handlers, interactionEffects]
  );
}
