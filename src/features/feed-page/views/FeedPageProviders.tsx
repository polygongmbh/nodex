import { getTaskPrimaryDate } from "@/types";
import { useMemo, type ComponentType, type ReactNode, type PropsWithChildren } from "react";
import type {
  FeedSidebarCommands,
  FeedViewCommands,
  FailedPublishCommands,
  TaskInteractionCommands,
} from "@/features/feed-page/interactions/feed-interaction-inputs";
import { FeedTaskCommandsProvider, type FeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  createFeedInteractionBus,
  type FeedInteractionEffect,
  type FeedInteractionHandlerMap,
} from "@/features/feed-page/interactions/feed-interaction-pipeline";
import { FeedSurfaceProvider, type FeedSurfaceState } from "./feed-surface-context";
import { ScrollCaptureProvider, type ScrollCaptureRef } from "./scroll-capture-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useComposerSignalsStore } from "@/features/feed-page/stores/composer-signals-store";
import { useOnboardingStore } from "@/components/onboarding/onboarding-store";
import { dismissRetryInProgress, notifyRetryInProgress } from "@/lib/notifications";

type ValueProvider<T> = ComponentType<{ value: T; children: ReactNode }>;
type ProviderEntry = readonly [ValueProvider<unknown>, unknown];

/** Pair a value-provider with its value while keeping the value type checked. */
function providerEntry<T>(Provider: ValueProvider<T>, value: T): ProviderEntry {
  return [Provider as ValueProvider<unknown>, value];
}

/** Nest a flat list of value-providers (outermost first) around children. */
function composeProviders(entries: readonly ProviderEntry[], children: ReactNode): ReactNode {
  return entries.reduceRight<ReactNode>(
    (acc, [Provider, value]) => <Provider value={value}>{acc}</Provider>,
    children
  );
}

export interface FeedPageCoreHandlers {
  onOpenAuthModal: (initialStep?: "choose" | "noas" | "noasSignUp") => void;
  onOpenShortcutsHelp: () => void;
  onGuardInteraction: (mode: "create" | "modify" | "post") => boolean;
  filterHandlers: FeedInteractionHandlerMap;
  interactionEffects: FeedInteractionEffect[];
}

interface FeedPageProvidersProps extends PropsWithChildren {
  coreHandlers: FeedPageCoreHandlers;
  surfaceState: FeedSurfaceState;
  sidebarCommands: FeedSidebarCommands;
  viewCommands: FeedViewCommands;
  taskCommands: FeedTaskCommands;
  taskInteractionCommands: TaskInteractionCommands;
  failedPublishCommands: FailedPublishCommands;
  scrollCaptureRef: ScrollCaptureRef;
}

interface FeedInteractionBusProviderProps extends PropsWithChildren {
  coreHandlers: FeedPageCoreHandlers;
  sidebarCommands: FeedSidebarCommands;
  viewCommands: FeedViewCommands;
  taskCommands: TaskInteractionCommands;
  failedPublishCommands: FailedPublishCommands;
}

/**
 * Builds the interaction bus from its command inputs and creates the dispatch
 * context. Every command group arrives as a plain prop — the bus reads no
 * context. (createTask lives in FeedTaskCommandsProvider for its component
 * consumers, which the bus does not touch.)
 */
function FeedInteractionBusProvider({
  coreHandlers,
  sidebarCommands,
  viewCommands,
  taskCommands,
  failedPublishCommands,
  children,
}: FeedInteractionBusProviderProps) {
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
        useOnboardingStore.getState().openGuide();
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
      "publish.failed.edit": (intent) => {
        failedPublishCommands.editFailedPublish(intent.draftId);
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
  sidebarCommands,
  viewCommands,
  taskCommands,
  taskInteractionCommands,
  failedPublishCommands,
  scrollCaptureRef,
  children,
}: FeedPageProvidersProps) {
  // The bus is the one non-value provider (it takes its inputs as discrete
  // props), so it wraps explicitly; the rest are a flat value-provider list.
  return (
    <FeedInteractionBusProvider
      coreHandlers={coreHandlers}
      sidebarCommands={sidebarCommands}
      viewCommands={viewCommands}
      taskCommands={taskInteractionCommands}
      failedPublishCommands={failedPublishCommands}
    >
      {composeProviders(
        [
          providerEntry(FeedTaskCommandsProvider, taskCommands),
          providerEntry(FeedSurfaceProvider, surfaceState),
          providerEntry(ScrollCaptureProvider, scrollCaptureRef),
        ],
        children
      )}
    </FeedInteractionBusProvider>
  );
}
