import { useCallback, useRef } from "react";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskCommands } from "@/features/feed-page/controllers/feed-task-commands-context";
import { notifyTaskCreationFailed } from "@/lib/notifications";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { resolveEffectiveWritableRelayIds } from "@/lib/nostr/task-relay-routing";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import type { TaskComposerFormData } from "./TaskComposer";
import type { TaskCreateResult, TaskState } from "@/types";

interface UseComposerSubmitHandlerOptions {
  focusedTaskId: string | null;
  initialState?: TaskState;
  closeOnSuccess?: boolean;
  onCancel: () => void;
}

export function useComposerSubmitHandler({
  focusedTaskId,
  initialState,
  closeOnSuccess = false,
  onCancel,
}: UseComposerSubmitHandlerOptions): (data: TaskComposerFormData) => void {
  const { relays } = useFeedSurfaceState();
  const relaysRef = useRef(relays);
  relaysRef.current = relays;

  const taskCommands = useFeedTaskCommands();
  const { t } = useTranslation("composer");

  return useCallback(
    (data: TaskComposerFormData) => {
      const currentRelays = relaysRef.current;
      const activeRelayIds = currentRelays
        .filter((relay) => relay.isActive)
        .map((relay) => relay.id);
      const relayIds = resolveEffectiveWritableRelayIds({
        selectedRelayIds: activeRelayIds,
        relays: currentRelays,
      });

      const publishingToastId = "task-composer-publishing";
      const skipLoadingToast = usePreferencesStore.getState().publishDelayEnabled;
      if (!skipLoadingToast) {
        toast.loading(t("composer.blocked.publishing"), { id: publishingToastId });
      }

      void (async () => {
        let result: TaskCreateResult;
        try {
          result = await taskCommands.createTask({
            ...data,
            relays: relayIds,
            focusedTaskId,
            initialState,
          });
        } catch (error) {
          console.error("Task submit failed", error);
          notifyTaskCreationFailed();
          if (!skipLoadingToast) toast.dismiss(publishingToastId);
          return;
        }
        toast.dismiss(publishingToastId);
        if (result.ok && closeOnSuccess) {
          onCancel();
        }
      })();
    },
    [closeOnSuccess, focusedTaskId, initialState, onCancel, t, taskCommands]
  );
}
