import type { Person, TaskStatus } from "@/types";

export type FeedInteractionIntent =
  | { type: "ui.openAuthModal"; initialStep?: string }
  | { type: "ui.focusSidebar" }
  | { type: "ui.focusTasks" }
  | { type: "filter.applyHashtagExclusive"; tag: string }
  | { type: "filter.applyAuthorExclusive"; author: Person }
  | { type: "filter.clearChannel"; channelId: string }
  | { type: "filter.clearPerson"; personId: string }
  | { type: "task.toggleComplete"; taskId: string }
  | { type: "task.changeStatus"; taskId: string; status: TaskStatus };

export type FeedInteractionIntentType = FeedInteractionIntent["type"];
