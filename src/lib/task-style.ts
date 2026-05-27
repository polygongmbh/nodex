import type { Post } from "@/types";
import { getTaskState } from "@/types";
import { isTaskTerminal } from "@/domain/content/task-state";
import { isTaskLockedUntilStart } from "@/lib/task-dates";
import { cn } from "@/lib/utils";

export interface TaskDisabledClassOptions {
  /**
   * Override the "completed" flag. FeedTaskCard uses this to combine
   * isTaskTerminal with isSoldListing (NIP-99 sold listings render as
   * completed even though the post itself isn't in a terminal task state).
   */
  completedOverride?: boolean;
}

export function getTaskDisabledClasses(post: Post, options?: TaskDisabledClassOptions): string {
  const isCompleted = options?.completedOverride ?? isTaskTerminal(getTaskState(post));
  const isLocked = isTaskLockedUntilStart(post);
  return cn(isCompleted && "opacity-60", isLocked && "opacity-50 grayscale");
}
