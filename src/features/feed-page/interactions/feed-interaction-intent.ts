import type {
  ChannelMatchMode,
  Nip99ListingStatus,
  TaskState,
  TaskDateType,
} from "@/types";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

export type DisplayDepthMode = "1" | "2" | "3" | "all" | "leaves" | "projects";

export type FeedInteractionIntent =
  | { type: "ui.openAuthModal"; initialStep?: string }
  | { type: "ui.openShortcutsHelp" }
  | { type: "ui.openGuide" }
  | { type: "ui.focusSidebar" }
  | { type: "ui.focusTasks" }
  | { type: "ui.interaction.guardModify" }
  | {
      type: "ui.view.change";
      view: ViewType;
      /**
       * Optional hint to pop a composer open on the target view. Currently
       * only kanban honors it (the StatusView "Create active project" card
       * uses this to land in kanban with the composer already open in the
       * first active column).
       */
      compose?: { columnSelector: "firstActive" };
    }
  | { type: "ui.search.change"; query: string }
  | { type: "ui.displayDepth.change"; mode: DisplayDepthMode }
  | { type: "filter.applyHashtagInclude"; tag: string }
  | { type: "filter.applyAuthorExclusive"; pubkey: string }
  | { type: "person.filter.exclusive"; pubkey: string }
  | { type: "person.filter.toggle"; pubkey: string }
  | { type: "person.compose.mention"; pubkey: string }
  | { type: "person.filterAndMention"; pubkey: string }
  | { type: "filter.clearChannel"; channelId: string }
  | { type: "filter.clearPerson"; personId: string }
  | { type: "filter.resetAll" }
  | { type: "sidebar.relay.select"; relayId: string; mode: "toggle" | "exclusive" }
  | { type: "sidebar.relay.toggle"; relayId: string }
  | { type: "sidebar.relay.exclusive"; relayId: string }
  | { type: "sidebar.relay.toggleAll" }
  | { type: "sidebar.relay.add"; url: string }
  | { type: "sidebar.relay.reorder"; orderedUrls: string[] }
  | { type: "sidebar.relay.remove"; url: string }
  | { type: "sidebar.relay.reconnect"; url: string; forceNewSocket?: boolean }
  | { type: "sidebar.channel.toggle"; channelId: string }
  | { type: "sidebar.channel.exclusive"; channelId: string }
  | { type: "sidebar.channel.toggleAll" }
  | { type: "sidebar.channel.matchMode.change"; mode: ChannelMatchMode }
  | { type: "sidebar.channel.pin"; channelId: string }
  | { type: "sidebar.channel.unpin"; channelId: string }
  | { type: "sidebar.person.toggle"; personId: string }
  | { type: "sidebar.person.exclusive"; personId: string }
  | { type: "sidebar.person.toggleAll" }
  | { type: "sidebar.person.pin"; personId: string }
  | { type: "sidebar.person.unpin"; personId: string }
  | { type: "sidebar.savedFilter.apply"; configurationId: string }
  | { type: "sidebar.savedFilter.saveCurrent"; name: string }
  | { type: "sidebar.savedFilter.rename"; configurationId: string; name: string }
  | { type: "sidebar.savedFilter.delete"; configurationId: string }
  | { type: "sidebar.quickFilter.recentDays.change"; days: number }
  | { type: "sidebar.quickFilter.recentEnabled.change"; enabled: boolean }
  | { type: "sidebar.quickFilter.minPriority.change"; priority: number }
  | { type: "sidebar.quickFilter.priorityEnabled.change"; enabled: boolean }
  | { type: "task.focus.change"; taskId: string | null; view?: ViewType }
  | { type: "task.toggleComplete"; taskId: string }
  | { type: "task.changeStatus"; taskId: string; state: TaskState }
  | { type: "task.updateDueDate"; taskId: string; dueDate?: Date; dueTime?: string; dateType?: TaskDateType }
  | { type: "task.updatePriority"; taskId: string; priority: number }
  | { type: "task.listingStatus.change"; taskId: string; status: Nip99ListingStatus }
  | { type: "task.delete"; taskId: string }
  | { type: "task.recompose"; taskId: string }
  | { type: "task.copyPermalink"; taskId: string }
  | { type: "task.undoPendingPublish"; taskId: string }
  | { type: "publish.failed.retry"; draftId: string }
  | { type: "publish.failed.repost"; draftId: string }
  | { type: "publish.failed.edit"; draftId: string }
  | { type: "publish.failed.discard"; draftId: string }
  | { type: "publish.failed.discardAll" };

export type FeedInteractionIntentType = FeedInteractionIntent["type"];
