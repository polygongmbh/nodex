import { useCallback, useRef } from "react";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
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

  const dispatch = useFeedInteractionDispatch();
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
          const event = await dispatch({
            type: "task.create",
            content: data.content,
            tags: data.tags,
            relays: relayIds,
            taskType: data.taskType,
            dueDate: data.dueDate,
            dueTime: data.dueTime,
            dateType: data.dateType,
            focusedTaskId,
            initialState,
            explicitMentionPubkeys: data.explicitMentionPubkeys,
            mentionIdentifiers: data.mentionIdentifiers,
            priority: data.priority,
            attachments: data.attachments,
            nip99: data.nip99,
            locationGeohash: data.locationGeohash,
            recomposeOf: data.recomposeOf,
          });
          result = (event.outcome.result as TaskCreateResult | undefined) ?? {
            ok: false,
            reason: "unexpected-error",
          };
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
    [closeOnSuccess, dispatch, focusedTaskId, initialState, onCancel, t]
  );
}
