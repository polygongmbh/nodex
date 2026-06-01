import { useMemo } from "react";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { TaskComposer, type TaskComposerFormData } from "./TaskComposer";
import type { PostType, TaskDate } from "@/types";

const DEFAULT_ALLOWED_POST_TYPES: readonly PostType[] = ["task", "comment"];
import { TaskComposerRuntimeProvider, useResolvedTaskComposerEnvironment } from "./task-composer-runtime";
import { useComposerRelayBlock } from "./use-composer-relay-block";
import { useComposerFilterSync } from "./use-composer-filter-sync";
import { useComposerSubmitHandler } from "./use-composer-submit-handler";
import { usePosts } from "@/features/feed-page/stores/posts-store";
import {
  useComposeGuideActivationSignal,
  useComposeRestoreSignal,
  useComposeRestoreRequestConsumedHandler,
  useMentionSignal,
  useMentionRequestConsumedHandler,
} from "@/features/feed-page/stores/composer-signals-store";
import { COMPOSE_DRAFT_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTaskAssigneePubkeys } from "@/types";

interface TaskCreateComposerProps {
  onCancel: () => void;
  compact?: boolean;
  defaultDates?: TaskDate[];
  defaultContent?: string;
  focusedTaskId: string | null;
  adaptiveSize?: boolean;
  focusOnMount?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  collapseOnSuccess?: boolean;
  allowedPostTypes?: readonly PostType[];
  onSubmit?: (data: TaskComposerFormData) => void;
}

export function TaskCreateComposer({
  onCancel,
  compact = false,
  defaultDates,
  defaultContent = "",
  focusedTaskId,
  adaptiveSize = false,
  focusOnMount = true,
  onExpandedChange,
  collapseOnSuccess = false,
  allowedPostTypes = DEFAULT_ALLOWED_POST_TYPES,
  onSubmit,
}: TaskCreateComposerProps) {
  const { createHttpAuthHeader } = useNDK();
  const posts = usePosts();
  const composeGuideActivationSignal = useComposeGuideActivationSignal();
  const mentionRequest = useMentionSignal();
  const onMentionRequestConsumed = useMentionRequestConsumedHandler();
  const composeRestoreRequest = useComposeRestoreSignal();
  const onComposeRestoreRequestConsumed = useComposeRestoreRequestConsumedHandler();
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
    ? posts.find((post) => post.id === focusedTaskId)
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
        defaultDates={defaultDates}
        defaultContent={defaultContent}
        allowEmptyTags={Boolean(focusedTaskId)}
        adaptiveSize={adaptiveSize}
        focusOnMount={focusOnMount}
        onExpandedChange={onExpandedChange}
        forceExpandSignal={composeGuideActivationSignal}
        mentionRequest={mentionRequest}
        onMentionRequestConsumed={onMentionRequestConsumed}
        collapseOnSuccess={collapseOnSuccess}
        allowedPostTypes={allowedPostTypes}
        composeRestoreRequest={composeRestoreRequest}
        onComposeRestoreRequestConsumed={onComposeRestoreRequestConsumed}
        contextTaskTitle={contextTaskTitle}
        inheritedTagNames={inheritedTagNames}
        inheritedMentionPubkeys={inheritedMentionPubkeys}
      />
    </TaskComposerRuntimeProvider>
  );
}
