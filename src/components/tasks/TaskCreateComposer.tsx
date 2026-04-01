import { useCallback } from "react";
import { TaskComposer, type TaskComposerSubmit } from "./TaskComposer";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import type {
  ComposeRestoreRequest,
  TaskCreateResult,
  TaskDateType,
  TaskInitialStatus,
  PublishedAttachment,
  Nip99Metadata,
} from "@/types";

interface TaskCreateComposerProps {
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
  parentId?: string;
  initialStatus?: TaskInitialStatus;
  adaptiveSize?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  draftStorageKey?: string;
  forceExpanded?: boolean;
  forceExpandSignal?: number;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  collapseOnSuccess?: boolean;
  closeOnSuccess?: boolean;
  allowComment?: boolean;
  allowFeedMessageTypes?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

export function TaskCreateComposer({
  onCancel,
  compact = false,
  defaultDueDate,
  defaultContent = "",
  parentId,
  initialStatus,
  adaptiveSize = false,
  onExpandedChange,
  draftStorageKey,
  forceExpanded = false,
  forceExpandSignal,
  mentionRequest = null,
  collapseOnSuccess = false,
  closeOnSuccess = false,
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
}: TaskCreateComposerProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  const handleSubmit = useCallback<TaskComposerSubmit>(
    async (
      content: string,
      tags: string[],
      relays: string[],
      taskType: string,
      dueDate?: Date,
      dueTime?: string,
      dateType?: TaskDateType,
      explicitMentionPubkeys?: string[],
      priority?: number,
      attachments?: PublishedAttachment[],
      nip99?: Nip99Metadata,
      locationGeohash?: string
    ) => {
      const event = await dispatchFeedInteraction({
        type: "task.create",
        content,
        tags,
        relays,
        taskType,
        dueDate,
        dueTime,
        dateType,
        parentId,
        initialStatus,
        explicitMentionPubkeys,
        priority,
        attachments,
        nip99,
        locationGeohash,
      });

      const result = (event.outcome.result as TaskCreateResult | undefined) ?? { ok: false, reason: "unexpected-error" };
      if (result.ok && closeOnSuccess) {
        onCancel();
      }
      return result;
    },
    [closeOnSuccess, dispatchFeedInteraction, initialStatus, onCancel, parentId]
  );

  return (
    <TaskComposer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      compact={compact}
      defaultDueDate={defaultDueDate}
      defaultContent={defaultContent}
      parentId={parentId}
      adaptiveSize={adaptiveSize}
      onExpandedChange={onExpandedChange}
      draftStorageKey={draftStorageKey}
      forceExpanded={forceExpanded}
      forceExpandSignal={forceExpandSignal}
      mentionRequest={mentionRequest}
      collapseOnSuccess={collapseOnSuccess}
      allowComment={allowComment}
      allowFeedMessageTypes={allowFeedMessageTypes}
      composeRestoreRequest={composeRestoreRequest}
    />
  );
}
