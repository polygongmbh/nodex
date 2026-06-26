import { getTaskPrimaryDate } from "@/types";
import { useMemo, type PropsWithChildren } from "react";
import { FeedSidebarControllerProvider, type FeedSidebarState } from "@/features/feed-page/controllers/feed-sidebar-controller-context";
import type { FeedSidebarCommands, FeedViewCommands, FailedPublishCommands } from "@/features/feed-page/interactions/feed-interaction-inputs";
import { FeedTaskCommandsProvider, type FeedTaskCommands, useFeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  createFeedInteractionBus,
  type FeedInteractionEffect,
  type FeedInteractionHandlerMap,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedSurfaceProvider, type FeedSurfaceState } from "./feed-surface-context";
import { FeedViewStateProvider, type FeedViewState } from "./feed-view-state-context";
import { ScrollCaptureProvider, type ScrollCaptureRef } from "./scroll-capture-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useComposerSignalsStore } from "@/features/feed-page/stores/composer-signals-store";
import { ProfileCompletionDialog } from "@/components/auth/ProfileCompletionDialog";
import { dismissRetryInProgress, notifyRetryInProgress } from "@/lib/notifications";

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
  viewState: FeedViewState;
  sidebarCommands: FeedSidebarCommands;
  viewCommands: FeedViewCommands;
  taskCommands: FeedTaskCommands;
  failedPublishCommands: FailedPublishCommands;
  sidebarController?: FeedSidebarState;
  scrollCaptureRef: ScrollCaptureRef;
}

interface FeedInteractionBusProviderProps extends PropsWithChildren {
  coreHandlers: FeedPageCoreHandlers;
  sidebarCommands: FeedSidebarCommands;
  viewCommands: FeedViewCommands;
  failedPublishCommands: FailedPublishCommands;
}

/**
 * Builds the interaction bus from its command inputs and creates the dispatch
 * context. Sidebar/view/failed-publish commands arrive as plain props (their
 * only consumer is this bus); task commands are still read from
 * FeedTaskCommandsProvider, which has external component consumers. Must be
 * rendered inside FeedTaskCommandsProvider.
 */
function FeedInteractionBusProvider({
  coreHandlers,
  sidebarCommands,
  viewCommands,
  failedPublishCommands,
  children,
}: FeedInteractionBusProviderProps) {
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
        if (intent.compose) {
          useComposerSignalsStore.getState().requestKanbanComposer(intent.compose.columnSelector);
        }
        viewCommands.setCurrentView(intent.view);
      },
      "ui.search.change": (intent) => {
        useFilterStore.getState().setSearchQuery(intent.query);
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
        sidebarCommands.reconnectRelay(intent.url, { forceNewSocket: intent.forceNewSocket });
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
        taskCommands.focusTask(intent.taskId, intent.view);
      },
      "task.toggleComplete": (intent) => {
        taskCommands.toggleComplete(intent.taskId);
      },
      "task.changeStatus": (intent) => {
        taskCommands.changeStatus(intent.taskId, intent.state);
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
      "task.delete": (intent) => {
        void taskCommands.deletePost(intent.taskId);
      },
      "task.recompose": (intent) => {
        taskCommands.recomposePost(intent.taskId);
      },
      "task.copyPermalink": (intent) => {
        void taskCommands.copyPermalink(intent.taskId);
      },
      "task.undoPendingPublish": (intent) => {
        taskCommands.undoPendingPublish(intent.taskId);
      },
      "publish.failed.retry": async (intent) => {
        const toastId = notifyRetryInProgress("retry");
        try {
          await failedPublishCommands.retryFailedPublish(intent.draftId);
        } finally {
          dismissRetryInProgress(toastId);
        }
      },
      "publish.failed.repost": async (intent) => {
        const toastId = notifyRetryInProgress("repost");
        try {
          await failedPublishCommands.repostFailedPublish(intent.draftId);
        } finally {
          dismissRetryInProgress(toastId);
        }
      },
      "publish.failed.discard": (intent) => {
        failedPublishCommands.dismissFailedPublish(intent.draftId);
      },
      "publish.failed.discardAll": () => {
        failedPublishCommands.dismissAllFailedPublish();
      },
    }),
    [coreHandlers, sidebarCommands, viewCommands, failedPublishCommands, taskCommands]
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
  viewState,
  sidebarCommands,
  viewCommands,
  taskCommands,
  failedPublishCommands,
  sidebarController,
  scrollCaptureRef,
  children,
}: FeedPageProvidersProps) {
  const content = sidebarController
    ? <FeedSidebarControllerProvider value={sidebarController}>{children}</FeedSidebarControllerProvider>
    : children;

  return (
    <FeedTaskCommandsProvider value={taskCommands}>
      <FeedInteractionBusProvider
        coreHandlers={coreHandlers}
        sidebarCommands={sidebarCommands}
        viewCommands={viewCommands}
        failedPublishCommands={failedPublishCommands}
      >
        <FeedSurfaceProvider value={surfaceState}>
          <FeedViewStateProvider value={viewState}>
            <ScrollCaptureProvider value={scrollCaptureRef}>
              {content}
              <ProfileCompletionDialog />
            </ScrollCaptureProvider>
          </FeedViewStateProvider>
        </FeedSurfaceProvider>
      </FeedInteractionBusProvider>
    </FeedTaskCommandsProvider>
  );
}
