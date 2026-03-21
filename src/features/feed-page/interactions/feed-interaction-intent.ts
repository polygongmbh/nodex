import type { ChannelMatchMode, Person, TaskStatus } from "@/types";

export type FeedInteractionIntent =
  | { type: "ui.openAuthModal"; initialStep?: string }
  | { type: "ui.openShortcutsHelp" }
  | { type: "ui.openGuide" }
  | { type: "ui.focusSidebar" }
  | { type: "ui.focusTasks" }
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
  | { type: "task.toggleComplete"; taskId: string }
  | { type: "task.changeStatus"; taskId: string; status: TaskStatus };

export type FeedInteractionIntentType = FeedInteractionIntent["type"];
