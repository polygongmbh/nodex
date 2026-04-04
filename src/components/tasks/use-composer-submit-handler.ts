import { useCallback } from "react";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { notifyTaskCreationFailed } from "@/lib/notifications";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TaskComposerFormData } from "./TaskComposer";
import type { TaskCreateResult, TaskInitialStatus } from "@/types";

interface UseComposerSubmitHandlerOptions {
  focusedTaskId: string | null;
  initialStatus?: TaskInitialStatus;
  activeRelayIds: string[];
  closeOnSuccess?: boolean;
  onCancel: () => void;
}

export function useComposerSubmitHandler({
  focusedTaskId,
  initialStatus,
  activeRelayIds,
  closeOnSuccess = false,
  onCancel,
}: UseComposerSubmitHandlerOptions): (data: TaskComposerFormData) => void {
  const dispatch = useFeedInteractionDispatch();
  const { t } = useTranslation();

  return useCallback(
    (data: TaskComposerFormData) => {
      const publishingToastId = "task-composer-publishing";
      toast.loading(t("composer.blocked.publishing"), { id: publishingToastId });

      void (async () => {
        let result: TaskCreateResult;
        try {
          const event = await dispatch({
            type: "task.create",
            content: data.content,
            tags: data.tags,
            relays: activeRelayIds,
            taskType: data.taskType,
            dueDate: data.dueDate,
            dueTime: data.dueTime,
            dateType: data.dateType,
            focusedTaskId,
            initialStatus,
            explicitMentionPubkeys: data.explicitMentionPubkeys,
            mentionIdentifiers: data.mentionIdentifiers,
            priority: data.priority,
            attachments: data.attachments,
            nip99: data.nip99,
            locationGeohash: data.locationGeohash,
          });
          result = (event.outcome.result as TaskCreateResult | undefined) ?? {
            ok: false,
            reason: "unexpected-error",
          };
        } catch (error) {
          console.error("Task submit failed", error);
          notifyTaskCreationFailed(t);
          toast.dismiss(publishingToastId);
          return;
        }
        toast.dismiss(publishingToastId);
        if (result.ok && closeOnSuccess) {
          onCancel();
        }
      })();
    },
    [activeRelayIds, closeOnSuccess, dispatch, focusedTaskId, initialStatus, onCancel, t]
  );
}
