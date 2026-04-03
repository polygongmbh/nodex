import { useCallback, useMemo } from "react";
import {
  TaskComposer,
  type TaskComposerSubmit,
  type TaskComposerSubmitPolicy,
  type TaskComposerSubmitRequest,
} from "./TaskComposer";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import type {
  ComposeRestoreRequest,
  Relay,
  TaskCreateResult,
  TaskInitialStatus,
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
  onMentionRequestConsumed?: (requestId: number) => void;
  collapseOnSuccess?: boolean;
  closeOnSuccess?: boolean;
  allowComment?: boolean;
  allowFeedMessageTypes?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

function isWritableRelay(relay: Relay | undefined): boolean {
  return relay?.connectionStatus === undefined || relay.connectionStatus === "connected";
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
  onMentionRequestConsumed,
  collapseOnSuccess = false,
  closeOnSuccess = false,
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
}: TaskCreateComposerProps) {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { relays } = useFeedSurfaceState();
  const { allTasks } = useFeedTaskViewModel();
  const parentTask = useMemo(
    () => (parentId ? allTasks.find((task) => task.id === parentId) : undefined),
    [allTasks, parentId]
  );
  const shouldHideComposer = useMemo(() => {
    if (!parentTask || parentTask.relays.length === 0) return false;
    const relaysById = new Map(relays.map((relay) => [relay.id, relay] as const));
    return parentTask.relays.every((relayId) => !isWritableRelay(relaysById.get(relayId)));
  }, [parentTask, relays]);
  const submitPolicy = useMemo<TaskComposerSubmitPolicy>(
    () => ({
      canInheritParentTags: Boolean(parentId),
      requiresSingleWritableRelayForTasks: !parentId,
    }),
    [parentId]
  );

  const handleSubmit = useCallback<TaskComposerSubmit>(
    async ({
      content,
      tags,
      relays,
      taskType,
      dueDate,
      dueTime,
      dateType,
      explicitMentionPubkeys,
      priority,
      attachments,
      nip99,
      locationGeohash,
    }: TaskComposerSubmitRequest) => {
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

  if (shouldHideComposer) {
    return null;
  }

  return (
    <TaskComposer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      compact={compact}
      defaultDueDate={defaultDueDate}
      defaultContent={defaultContent}
      submitPolicy={submitPolicy}
      adaptiveSize={adaptiveSize}
      onExpandedChange={onExpandedChange}
      draftStorageKey={draftStorageKey}
      forceExpanded={forceExpanded}
      forceExpandSignal={forceExpandSignal}
      mentionRequest={mentionRequest}
      onMentionRequestConsumed={onMentionRequestConsumed}
      collapseOnSuccess={collapseOnSuccess}
      allowComment={allowComment}
      allowFeedMessageTypes={allowFeedMessageTypes}
      composeRestoreRequest={composeRestoreRequest}
    />
  );
}
