import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { TaskComposer } from "./TaskComposer";
import { TaskComposerRuntimeProvider, useResolvedTaskComposerEnvironment } from "./task-composer-runtime";
import { useComposerRelayBlock } from "./use-composer-relay-block";
import { useComposerFilterSync } from "./use-composer-filter-sync";
import { useComposerSubmitHandler } from "./use-composer-submit-handler";
import type { ComposeRestoreRequest, TaskInitialStatus } from "@/types";

interface TaskCreateComposerProps {
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
  focusedTaskId: string | null;
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

export function TaskCreateComposer({
  onCancel,
  compact = false,
  defaultDueDate,
  defaultContent = "",
  focusedTaskId,
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
  const { createHttpAuthHeader } = useNDK();
  const environment = useResolvedTaskComposerEnvironment({});
  const { shouldHideComposer, activeWritableRelayIds, canCreateContent, externalSubmitBlockByType } =
    useComposerRelayBlock(focusedTaskId);
  const filterSync = useComposerFilterSync(environment);
  const handleSubmit = useComposerSubmitHandler({
    focusedTaskId,
    initialStatus,
    activeRelayIds: activeWritableRelayIds,
    closeOnSuccess,
    onCancel,
  });

  if (shouldHideComposer) return null;

  return (
    <TaskComposerRuntimeProvider value={{ environment, draftStorageKey }}>
      <TaskComposer
        onSubmit={handleSubmit}
        onCancel={onCancel}
        externalSubmitBlockByType={externalSubmitBlockByType}
        canCreateContent={canCreateContent}
        getUploadAuthHeader={createHttpAuthHeader}
        {...filterSync}
        options={{
          compact,
          defaultDueDate,
          defaultContent,
          allowEmptyTags: Boolean(focusedTaskId),
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
