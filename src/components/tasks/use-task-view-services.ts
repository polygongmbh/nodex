import { useCallback, useMemo } from "react";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import type { FeedViewType } from "@/features/feed-page/interactions/feed-interaction-intent";

export function useTaskViewServices() {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const authPolicy = useAuthActionPolicy();

  const focusTask = useCallback(
    (taskId: string | null, view?: FeedViewType) => {
      void dispatchFeedInteraction({ type: "task.focus.change", taskId, view });
    },
    [dispatchFeedInteraction]
  );

  const focusSidebar = useCallback(() => {
    void dispatchFeedInteraction({ type: "ui.focusSidebar" });
  }, [dispatchFeedInteraction]);

  const guardModify = useCallback(() => {
    void dispatchFeedInteraction({ type: "ui.interaction.guardModify" });
  }, [dispatchFeedInteraction]);

  return useMemo(
    () => ({
      authPolicy,
      focusTask,
      focusSidebar,
      guardModify,
    }),
    [authPolicy, focusSidebar, focusTask, guardModify]
  );
}
