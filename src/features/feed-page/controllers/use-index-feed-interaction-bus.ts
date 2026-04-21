import { useMemo } from "react";
import { createFeedInteractionMiddlewareSkeleton } from "@/features/feed-page/interactions/feed-interaction-middleware-skeleton";
import {
  createFeedInteractionBus,
  type FeedInteractionBus,
  type FeedInteractionEffect,
  type FeedInteractionHandlerMap,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import type { FeedSidebarCommands } from "./feed-sidebar-commands-context";
import type { FeedViewCommands } from "./feed-view-commands-context";
import type { FeedTaskCommands } from "./feed-task-commands-context";

interface UseIndexFeedInteractionBusOptions {
  handleOpenAuthModal: (initialStep?: "choose" | "noas" | "noasSignUp") => void;
  openShortcutsHelp: () => void;
  handleOpenGuide: () => void;
  guardInteraction: (mode: "create" | "modify") => boolean;
  filterHandlers: FeedInteractionHandlerMap;
  sidebarCommands: FeedSidebarCommands;
  viewCommands: FeedViewCommands;
  taskCommands: FeedTaskCommands;
  interactionEffects: FeedInteractionEffect[];
}

export function useIndexFeedInteractionBus({
  handleOpenAuthModal,
  openShortcutsHelp,
  handleOpenGuide,
  guardInteraction,
  filterHandlers,
  sidebarCommands,
  viewCommands,
  taskCommands,
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
      "ui.interaction.guardModify": () => {
        guardInteraction("modify");
      },
      "ui.focusSidebar": () => {
        viewCommands.focusSidebar();
      },
      "ui.focusTasks": () => {
        viewCommands.focusTasks();
      },
      "ui.view.change": (intent) => {
        viewCommands.setCurrentView(intent.view);
      },
      "ui.search.change": (intent) => {
        viewCommands.setSearchQuery(intent.query);
      },
      "ui.kanbanDepth.change": (intent) => {
        viewCommands.setKanbanDepthMode(intent.mode);
      },
      "ui.manageRoute.change": (intent) => {
        viewCommands.setManageRouteActive(intent.isActive);
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
        sidebarCommands.applySavedFilter(intent.configurationId);
      },
      "sidebar.savedFilter.saveCurrent": (intent) => {
        sidebarCommands.saveCurrentFilter(intent.name);
      },
      "sidebar.savedFilter.rename": (intent) => {
        sidebarCommands.renameSavedFilter(intent.configurationId, intent.name);
      },
      "sidebar.savedFilter.delete": (intent) => {
        sidebarCommands.deleteSavedFilter(intent.configurationId);
      },
      "task.focus.change": (intent) => {
        taskCommands.focusTask(intent.taskId);
      },
      "task.create": (intent) => {
        return taskCommands.createTask(
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
        taskCommands.toggleComplete(intent.taskId);
      },
      "task.changeStatus": (intent) => {
        taskCommands.changeStatus(intent.taskId, intent.status);
      },
      "task.updateDueDate": (intent) => {
        taskCommands.updateDueDate(intent.taskId, intent.dueDate, intent.dueTime, intent.dateType);
      },
      "task.updatePriority": (intent) => {
        taskCommands.updatePriority(intent.taskId, intent.priority);
      },
      "task.listingStatus.change": (intent) => {
        taskCommands.changeListingStatus(intent.taskId, intent.status);
      },
      "task.undoPendingPublish": (intent) => {
        taskCommands.undoPendingPublish(intent.taskId);
      },
      "publish.failed.retry": (intent) => {
        taskCommands.retryFailedPublish(intent.draftId);
      },
      "publish.failed.repost": (intent) => {
        taskCommands.repostFailedPublish(intent.draftId);
      },
      "publish.failed.dismiss": (intent) => {
        taskCommands.dismissFailedPublish(intent.draftId);
      },
      "publish.failed.dismissAll": () => {
        taskCommands.dismissAllFailedPublish();
      },
    }),
    [
      filterHandlers,
      guardInteraction,
      handleOpenAuthModal,
      handleOpenGuide,
      openShortcutsHelp,
      sidebarCommands,
      viewCommands,
      taskCommands,
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
