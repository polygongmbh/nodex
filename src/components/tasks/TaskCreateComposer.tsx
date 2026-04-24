import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { TaskComposer } from "./TaskComposer";
import { TaskComposerRuntimeProvider, useResolvedTaskComposerEnvironment } from "./task-composer-runtime";
import { useComposerRelayBlock } from "./use-composer-relay-block";
import { useComposerFilterSync } from "./use-composer-filter-sync";
import { useComposerSubmitHandler } from "./use-composer-submit-handler";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import type { ComposeRestoreRequest, TaskStatus } from "@/types";

interface TaskCreateComposerProps {
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
  focusedTaskId: string | null;
  initialStatus?: TaskStatus;
  adaptiveSize?: boolean;
  focusOnMount?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
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
  focusOnMount = true,
  onExpandedChange,
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
  const { allTasks } = useFeedTaskViewModel();
  const environment = useResolvedTaskComposerEnvironment({});
  const { shouldHideComposer, effectiveWritableRelayIds, canCreateContent, externalSubmitBlockByType } =
    useComposerRelayBlock(focusedTaskId);
  const filterSync = useComposerFilterSync(environment);
  const contextTaskTitle = focusedTaskId
    ? allTasks.find((task) => task.id === focusedTaskId)?.content ?? ""
    : "";
  const handleSubmit = useComposerSubmitHandler({
    focusedTaskId,
    initialStatus,
    activeRelayIds: effectiveWritableRelayIds,
    closeOnSuccess,
    onCancel,
  });

  if (shouldHideComposer) return null;

  return (
    <TaskComposerRuntimeProvider value={{ environment, draftStorageKey: COMPOSE_DRAFT_STORAGE_KEY }}>
      <TaskComposer
        onSubmit={handleSubmit}
        onCancel={onCancel}
        externalSubmitBlockByType={externalSubmitBlockByType}
        canCreateContent={canCreateContent}
        getUploadAuthHeader={async (url, method) => createHttpAuthHeader(url, method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE")}
        filterSync={filterSync}
        compact={compact}
        defaultDueDate={defaultDueDate}
        defaultContent={defaultContent}
        allowEmptyTags={Boolean(focusedTaskId)}
        adaptiveSize={adaptiveSize}
        focusOnMount={focusOnMount}
        onExpandedChange={onExpandedChange}
        forceExpanded={forceExpanded}
        forceExpandSignal={forceExpandSignal}
        mentionRequest={mentionRequest}
        onMentionRequestConsumed={onMentionRequestConsumed}
        collapseOnSuccess={collapseOnSuccess}
        allowComment={allowComment}
        allowFeedMessageTypes={allowFeedMessageTypes}
        composeRestoreRequest={composeRestoreRequest}
        contextTaskTitle={contextTaskTitle}
      />
    </TaskComposerRuntimeProvider>
  );
}
