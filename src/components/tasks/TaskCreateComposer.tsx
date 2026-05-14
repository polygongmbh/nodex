import { useMemo } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { TaskComposer, type TaskComposerFormData } from "./TaskComposer";
import { TaskComposerRuntimeProvider, useResolvedTaskComposerEnvironment } from "./task-composer-runtime";
import { useComposerRelayBlock } from "./use-composer-relay-block";
import { useComposerFilterSync } from "./use-composer-filter-sync";
import { useComposerSubmitHandler } from "./use-composer-submit-handler";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTaskAssigneePubkeys, type ComposeRestoreRequest } from "@/types";

interface TaskCreateComposerProps {
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
  focusedTaskId: string | null;
  adaptiveSize?: boolean;
  focusOnMount?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  onMentionRequestConsumed?: (requestId: number) => void;
  collapseOnSuccess?: boolean;
  allowComment?: boolean;
  allowFeedMessageTypes?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
  onSubmit?: (data: TaskComposerFormData) => void;
}

export function TaskCreateComposer({
  onCancel,
  compact = false,
  defaultDueDate,
  defaultContent = "",
  focusedTaskId,
  adaptiveSize = false,
  focusOnMount = true,
  onExpandedChange,
  mentionRequest = null,
  onMentionRequestConsumed,
  collapseOnSuccess = false,
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
  onSubmit,
}: TaskCreateComposerProps) {
  const { createHttpAuthHeader } = useNDK();
  const { allTasks, composeGuideActivationSignal } = useFeedTaskViewModel();
  const environment = useResolvedTaskComposerEnvironment({});
  const {
    shouldHideComposer,
    canCreateContent,
    hasInvalidRootTaskRelaySelection,
    hasInvalidRootCommentRelaySelection,
    hasNoWritableSelectedRelays,
  } = useComposerRelayBlock(focusedTaskId);
  const filterSync = useComposerFilterSync(environment);
  const isMobile = useIsMobile();
  const parentTask = focusedTaskId
    ? allTasks.find((task) => task.id === focusedTaskId)
    : undefined;
  const contextTaskTitle = parentTask?.content ?? "";
  const inheritedTagNames = useMemo(() => {
    if (isMobile || !parentTask) return [];
    return Array.from(
      new Set(
        (parentTask.tags || [])
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }, [isMobile, parentTask]);
  const inheritedMentionPubkeys = useMemo(() => {
    if (isMobile || !parentTask) return [];
    return Array.from(
      new Set(
        getTaskAssigneePubkeys(parentTask)
          .map((pubkey) => pubkey.trim().toLowerCase())
          .filter((pubkey) => /^[a-f0-9]{64}$/i.test(pubkey))
      )
    );
  }, [isMobile, parentTask]);
  const defaultSubmit = useComposerSubmitHandler({
    focusedTaskId,
    onCancel,
  });
  const handleSubmit = onSubmit ?? defaultSubmit;

  if (shouldHideComposer) return null;

  return (
    <TaskComposerRuntimeProvider value={{ environment, draftStorageKey: COMPOSE_DRAFT_STORAGE_KEY }}>
      <TaskComposer
        onSubmit={handleSubmit}
        onCancel={onCancel}
        hasInvalidRootTaskRelaySelection={hasInvalidRootTaskRelaySelection}
        hasInvalidRootCommentRelaySelection={hasInvalidRootCommentRelaySelection}
        hasNoWritableSelectedRelays={hasNoWritableSelectedRelays}
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
        forceExpandSignal={composeGuideActivationSignal}
        mentionRequest={mentionRequest}
        onMentionRequestConsumed={onMentionRequestConsumed}
        collapseOnSuccess={collapseOnSuccess}
        allowComment={allowComment}
        allowFeedMessageTypes={allowFeedMessageTypes}
        composeRestoreRequest={composeRestoreRequest}
        contextTaskTitle={contextTaskTitle}
        inheritedTagNames={inheritedTagNames}
        inheritedMentionPubkeys={inheritedMentionPubkeys}
      />
    </TaskComposerRuntimeProvider>
  );
}
