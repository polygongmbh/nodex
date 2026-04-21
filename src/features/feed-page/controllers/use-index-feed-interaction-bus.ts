import { useMemo } from "react";
import { createFeedInteractionMiddlewareSkeleton } from "@/features/feed-page/interactions/feed-interaction-middleware-skeleton";
import {
  createFeedInteractionBus,
  type FeedInteractionBus,
  type FeedInteractionEffect,
  type FeedInteractionHandlerMap,
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
      "sidebar.channel.toggle": (intent) => {
        sidebarCommands.toggleChannel(intent.channelId);
      },
      "sidebar.channel.exclusive": (intent) => {
        sidebarCommands.showOnlyChannel(intent.channelId);
      },
      "sidebar.channel.toggleAll": () => {
        sidebarCommands.toggleAllChannels();
      },
      "sidebar.channel.matchMode.change": (intent) => {
        sidebarCommands.setChannelMatchMode(intent.mode);
      },
      "sidebar.channel.pin": (intent) => {
        sidebarCommands.pinChannel(intent.channelId);
      },
      "sidebar.channel.unpin": (intent) => {
        sidebarCommands.unpinChannel(intent.channelId);
      },
      "sidebar.person.toggle": (intent) => {
        sidebarCommands.togglePerson(intent.personId);
      },
      "sidebar.person.exclusive": (intent) => {
        sidebarCommands.showOnlyPerson(intent.personId);
      },
      "sidebar.person.toggleAll": () => {
        sidebarCommands.toggleAllPeople();
      },
      "sidebar.person.pin": (intent) => {
        sidebarCommands.pinPerson(intent.personId);
      },
      "sidebar.person.unpin": (intent) => {
        sidebarCommands.unpinPerson(intent.personId);
      },
      "sidebar.relay.select": (intent) => {
        sidebarCommands.selectRelay(intent.relayId, intent.mode);
      },
      "sidebar.relay.toggle": (intent) => {
        sidebarCommands.toggleRelay(intent.relayId);
      },
      "sidebar.relay.exclusive": (intent) => {
        sidebarCommands.showOnlyRelay(intent.relayId);
      },
      "sidebar.relay.toggleAll": () => {
        sidebarCommands.toggleAllRelays();
      },
      "sidebar.relay.add": (intent) => {
        sidebarCommands.addRelay(intent.url);
      },
      "sidebar.relay.reorder": (intent) => {
        sidebarCommands.reorderRelays(intent.orderedUrls);
      },
      "sidebar.relay.remove": (intent) => {
        sidebarCommands.removeRelay(intent.url);
      },
      "sidebar.relay.reconnect": (intent) => {
        sidebarCommands.reconnectRelay(intent.url);
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
      handleRepostFailedPublish,
      handleRetryFailedPublish,
      handleStatusChange,
      handleToggleComplete,
      handleUndoPendingPublish,
      openShortcutsHelp,
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
