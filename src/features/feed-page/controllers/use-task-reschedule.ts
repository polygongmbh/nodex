import { useCallback, useMemo } from "react";
import { canUserUpdateTask } from "@/domain/content/task-permissions";
import { planTaskDateShift, type TaskDateShiftMode } from "@/domain/content/task-date-shift";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useCurrentUser } from "@/features/feed-page/stores/current-user-store";
import { useIsInteractionBlocked } from "@/features/feed-page/stores/interaction-block-store";
import { featureDebugLog } from "@/lib/feature-debug";
import { isTaskPost, type Post, type TaskPost } from "@/types";

export interface TaskRescheduleCommands {
  /** Whether the viewer may drag this post's dates. Calendar events are not draggable. */
  canReschedule: (post: Post) => post is TaskPost;
  /** Republish the dates a drag of `deltaDays` implies; no-op for a zero delta. */
  reschedule: (task: TaskPost, mode: TaskDateShiftMode, deltaDays: number) => void;
}

/** Drag-and-drop rescheduling shared by the calendar and Gantt views. */
export function useTaskReschedule(): TaskRescheduleCommands {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const currentUser = useCurrentUser();
  const isInteractionBlocked = useIsInteractionBlocked();

  const canReschedule = useCallback(
    (post: Post): post is TaskPost => !isInteractionBlocked && isTaskPost(post) && canUserUpdateTask(post, currentUser),
    [currentUser, isInteractionBlocked]
  );

  const reschedule = useCallback(
    (task: TaskPost, mode: TaskDateShiftMode, deltaDays: number) => {
      const changes = planTaskDateShift(task, mode, deltaDays);
      featureDebugLog("reschedule", "Drag rescheduled task", { taskId: task.id, mode, deltaDays, changes });
      if (changes.length === 0) return;
      void dispatchFeedInteraction({ type: "task.updateDates", taskId: task.id, changes });
    },
    [dispatchFeedInteraction]
  );

  return useMemo(() => ({ canReschedule, reschedule }), [canReschedule, reschedule]);
}
