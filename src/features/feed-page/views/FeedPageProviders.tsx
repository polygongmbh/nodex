import { useMemo, type PropsWithChildren } from "react";
import { FeedSidebarControllerProvider, type FeedSidebarState } from "@/features/feed-page/controllers/feed-sidebar-controller-context";
import { FeedSidebarCommandsProvider, type FeedSidebarCommands, useFeedSidebarCommands } from "@/features/feed-page/controllers/feed-sidebar-commands-context";
import { FeedViewCommandsProvider, type FeedViewCommands, useFeedViewCommands } from "@/features/feed-page/controllers/feed-view-commands-context";
import { FeedTaskCommandsProvider, type FeedTaskCommands, useFeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  createFeedInteractionBus,
  type FeedInteractionEffect,
  type FeedInteractionHandlerMap,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedSurfaceProvider, type FeedSurfaceState } from "./feed-surface-context";
import { FeedTaskViewModelProvider, type FeedTaskViewModel } from "./feed-task-view-model-context";
import { FeedViewStateProvider, type FeedViewState } from "./feed-view-state-context";
import { ProfileCompletionDialog } from "@/components/auth/ProfileCompletionDialog";

export interface FeedPageCoreHandlers {
  onOpenAuthModal: (initialStep?: "choose" | "noas" | "noasSignUp") => void;
  onOpenShortcutsHelp: () => void;
  onOpenGuide: () => void;
  onGuardInteraction: (mode: "create" | "modify" | "post") => boolean;
  filterHandlers: FeedInteractionHandlerMap;
  interactionEffects: FeedInteractionEffect[];
}

interface FeedPageProvidersProps extends PropsWithChildren {
  coreHandlers: FeedPageCoreHandlers;
  surfaceState: FeedSurfaceState;
  taskViewModel: FeedTaskViewModel;
  viewState: FeedViewState;
  sidebarCommands: FeedSidebarCommands;
  viewCommands: FeedViewCommands;
  taskCommands: FeedTaskCommands;
  sidebarController?: FeedSidebarState;
}

/**
 * Inner component that reads from feature command contexts and creates the interaction bus.
 * Must be rendered after FeedSidebarCommandsProvider, FeedViewCommandsProvider, and
 * FeedTaskCommandsProvider so the command contexts are available.
 */
function FeedInteractionBusFromContexts({
  coreHandlers,
  children,
}: PropsWithChildren<{ coreHandlers: FeedPageCoreHandlers }>) {
  const sidebarCommands = useFeedSidebarCommands();
  const viewCommands = useFeedViewCommands();
  const taskCommands = useFeedTaskCommands();

  const handlers: FeedInteractionHandlerMap = useMemo(
    () => ({
      "ui.openAuthModal": (intent) => {
        if (
          intent.initialStep === "choose" ||
          intent.initialStep === "noas" ||
          intent.initialStep === "noasSignUp"
        ) {
          coreHandlers.onOpenAuthModal(intent.initialStep);
          return;
        }
        coreHandlers.onOpenAuthModal();
      },
      "ui.openShortcutsHelp": () => {
        coreHandlers.onOpenShortcutsHelp();
      },
      "ui.openGuide": () => {
        coreHandlers.onOpenGuide();
      },
      "ui.interaction.guardModify": () => {
        coreHandlers.onGuardInteraction("modify");
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
      "ui.displayDepth.change": (intent) => {
        viewCommands.setDisplayDepthMode(intent.mode);
      },
      "ui.manageRoute.change": (intent) => {
        viewCommands.setManageRouteActive(intent.isActive);
      },
      ...coreHandlers.filterHandlers,
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
    [coreHandlers, sidebarCommands, viewCommands, taskCommands]
  );

  const bus = useMemo(
    () => createFeedInteractionBus({ handlers, effects: coreHandlers.interactionEffects }),
    [handlers, coreHandlers.interactionEffects]
  );

  return <FeedInteractionProvider bus={bus}>{children}</FeedInteractionProvider>;
}

export function FeedPageProviders({
  coreHandlers,
  surfaceState,
  taskViewModel,
  viewState,
  sidebarCommands,
  viewCommands,
  taskCommands,
  sidebarController,
  children,
}: FeedPageProvidersProps) {
  const content = sidebarController
    ? <FeedSidebarControllerProvider value={sidebarController}>{children}</FeedSidebarControllerProvider>
    : children;

  return (
    <FeedSidebarCommandsProvider value={sidebarCommands}>
      <FeedViewCommandsProvider value={viewCommands}>
        <FeedTaskCommandsProvider value={taskCommands}>
          <FeedInteractionBusFromContexts coreHandlers={coreHandlers}>
            <FeedSurfaceProvider value={surfaceState}>
              <FeedViewStateProvider value={viewState}>
                <FeedTaskViewModelProvider value={taskViewModel}>{content}</FeedTaskViewModelProvider>
                <ProfileCompletionDialog />
              </FeedViewStateProvider>
            </FeedSurfaceProvider>
          </FeedInteractionBusFromContexts>
        </FeedTaskCommandsProvider>
      </FeedViewCommandsProvider>
    </FeedSidebarCommandsProvider>
  );
}
