import { useCallback, useMemo } from "react";
import {
  TaskComposer,
  type TaskComposerSubmit,
  type TaskComposerSubmitRequest,
} from "./TaskComposer";
import {
  TaskComposerRuntimeProvider,
  useResolvedTaskComposerEnvironment,
} from "./task-composer-runtime";
import { resolveComposeSubmitBlock, type ComposeSubmitBlockState } from "@/lib/compose-submit-block";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useTranslation } from "react-i18next";
import type {
  ComposeRestoreRequest,
  PostType,
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
  const { t } = useTranslation();
  const composerEnvironment = useResolvedTaskComposerEnvironment({});
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
  const activeWritableRelayIds = useMemo(
    () => relays.filter((relay) => relay.isActive && isWritableRelay(relay)).map((relay) => relay.id),
    [relays]
  );
  const submitBlockByType = useMemo<Partial<Record<PostType, ComposeSubmitBlockState | null>>>(
    () => {
      const taskBlock = resolveComposeSubmitBlock({
        isSignedIn: true,
        hasMeaningfulContent: true,
        hasAtLeastOneTag: true,
        canInheritParentTags: true,
        hasPendingAttachmentUploads: false,
        hasFailedAttachmentUploads: false,
        hasInvalidRootTaskRelaySelection: !parentId && activeWritableRelayIds.length !== 1,
        t,
      });
      const replyBlock = resolveComposeSubmitBlock({
        isSignedIn: true,
        hasMeaningfulContent: true,
        hasAtLeastOneTag: true,
        canInheritParentTags: true,
        hasPendingAttachmentUploads: false,
        hasFailedAttachmentUploads: false,
        hasInvalidRootCommentRelaySelection: activeWritableRelayIds.length === 0,
        t,
      });
      return {
        task: taskBlock,
        comment: replyBlock,
        offer: replyBlock,
        request: replyBlock,
      };
    },
    [activeWritableRelayIds, parentId, t]
  );

  const handleSubmit = useCallback<TaskComposerSubmit>(
    async ({
      content,
      tags,
      taskType,
      dueDate,
      dueTime,
      dateType,
      explicitMentionPubkeys,
      mentionIdentifiers,
      priority,
      attachments,
      nip99,
      locationGeohash,
    }: TaskComposerSubmitRequest) => {
      const event = await dispatchFeedInteraction({
        type: "task.create",
        content,
        tags,
        relays: activeWritableRelayIds,
        taskType,
        dueDate,
        dueTime,
        dateType,
        parentId,
        initialStatus,
        explicitMentionPubkeys,
        mentionIdentifiers,
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
    [activeWritableRelayIds, closeOnSuccess, dispatchFeedInteraction, initialStatus, onCancel, parentId]
  );

  if (shouldHideComposer) {
    return null;
  }

  return (
    <TaskComposerRuntimeProvider
      value={{ environment: composerEnvironment, draftStorageKey }}
    >
      <TaskComposer
        onSubmit={handleSubmit}
        onCancel={onCancel}
        submitBlockByType={submitBlockByType}
        options={{
          compact,
          defaultDueDate,
          defaultContent,
          allowEmptyTags: Boolean(parentId),
          adaptiveSize,
          onExpandedChange,
          forceExpanded,
          forceExpandSignal,
          mentionRequest,
          onMentionRequestConsumed,
          collapseOnSuccess,
          allowComment,
          allowFeedMessageTypes,
          composeRestoreRequest,
        }}
      />
    </TaskComposerRuntimeProvider>
  );
}
