import { useCallback, useMemo } from "react";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedTaskCommands } from "@/features/feed-page/views/feed-task-command-context";

export function useTaskViewServices() {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { onNewTask } = useFeedTaskCommands();
  const authPolicy = useAuthActionPolicy();

  const focusTask = useCallback(
    (taskId: string | null) => {
      void dispatchFeedInteraction({ type: "task.focus.change", taskId });
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
      onNewTask,
      focusTask,
      focusSidebar,
      guardModify,
    }),
    [authPolicy, focusSidebar, focusTask, guardModify, onNewTask]
  );
}
