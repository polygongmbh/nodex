import type {
  ChannelMatchMode,
  Nip99ListingStatus,
  Person,
  TaskDateType,
  TaskStatus,
} from "@/types";

export type FeedViewType = "tree" | "feed" | "kanban" | "calendar" | "list";
export type FeedKanbanDepthMode = "1" | "2" | "3" | "all" | "leaves" | "projects";

export type FeedInteractionIntent =
  | { type: "ui.openAuthModal"; initialStep?: string }
  | { type: "ui.openShortcutsHelp" }
  | { type: "ui.openGuide" }
  | { type: "ui.focusSidebar" }
  | { type: "ui.focusTasks" }
  | { type: "ui.view.change"; view: FeedViewType }
  | { type: "ui.search.change"; query: string }
  | { type: "ui.kanbanDepth.change"; mode: FeedKanbanDepthMode }
  | { type: "ui.manageRoute.change"; isActive: boolean }
  | { type: "filter.applyHashtagExclusive"; tag: string }
  | { type: "filter.applyAuthorExclusive"; author: Person }
  | { type: "filter.clearChannel"; channelId: string }
  | { type: "filter.clearPerson"; personId: string }
  | { type: "sidebar.relay.toggle"; relayId: string }
  | { type: "sidebar.relay.exclusive"; relayId: string }
  | { type: "sidebar.relay.toggleAll" }
  | { type: "sidebar.relay.add"; url: string }
  | { type: "sidebar.relay.remove"; url: string }
  | { type: "sidebar.relay.reconnect"; url: string }
  | { type: "sidebar.channel.toggle"; channelId: string }
  | { type: "sidebar.channel.exclusive"; channelId: string }
  | { type: "sidebar.channel.toggleAll" }
  | { type: "sidebar.channel.matchMode.change"; mode: ChannelMatchMode }
  | { type: "sidebar.channel.pin"; channelId: string }
  | { type: "sidebar.channel.unpin"; channelId: string }
  | { type: "sidebar.person.toggle"; personId: string }
  | { type: "sidebar.person.exclusive"; personId: string }
  | { type: "sidebar.person.toggleAll" }
  | { type: "sidebar.savedFilter.apply"; configurationId: string }
  | { type: "sidebar.savedFilter.saveCurrent"; name: string }
  | { type: "sidebar.savedFilter.rename"; configurationId: string; name: string }
  | { type: "sidebar.savedFilter.delete"; configurationId: string }
  | { type: "sidebar.quickFilter.recentDays.change"; days: number }
  | { type: "sidebar.quickFilter.recentEnabled.change"; enabled: boolean }
  | { type: "sidebar.quickFilter.minPriority.change"; priority: number }
  | { type: "sidebar.quickFilter.priorityEnabled.change"; enabled: boolean }
  | { type: "task.focus.change"; taskId: string | null }
  | { type: "task.toggleComplete"; taskId: string }
  | { type: "task.changeStatus"; taskId: string; status: TaskStatus }
  | { type: "task.updateDueDate"; taskId: string; dueDate?: Date; dueTime?: string; dateType?: TaskDateType }
  | { type: "task.updatePriority"; taskId: string; priority: number }
  | { type: "task.listingStatus.change"; taskId: string; status: Nip99ListingStatus }
  | { type: "task.undoPendingPublish"; taskId: string }
  | { type: "publish.failed.retry"; draftId: string }
  | { type: "publish.failed.repost"; draftId: string }
  | { type: "publish.failed.dismiss"; draftId: string }
  | { type: "publish.failed.dismissAll" };

export type FeedInteractionIntentType = FeedInteractionIntent["type"];
