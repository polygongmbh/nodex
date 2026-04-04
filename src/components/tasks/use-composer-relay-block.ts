import { useMemo } from "react";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { resolveComposeSubmitBlock, type ComposeSubmitBlockState } from "@/lib/compose-submit-block";
import { isWritableRelay } from "./task-composer-runtime";
import { useTranslation } from "react-i18next";
import type { PostType } from "@/types";

export interface ComposerRelayBlock {
  shouldHideComposer: boolean;
  activeWritableRelayIds: string[];
  canCreateContent: boolean;
  externalSubmitBlockByType: Partial<Record<PostType, ComposeSubmitBlockState | null>>;
}

export function useComposerRelayBlock(parentId?: string): ComposerRelayBlock {
  const { relays } = useFeedSurfaceState();
  const { allTasks } = useFeedTaskViewModel();
  const authPolicy = useAuthActionPolicy();
  const { t } = useTranslation();

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

  const externalSubmitBlockByType = useMemo<Partial<Record<PostType, ComposeSubmitBlockState | null>>>(() => {
    const taskBlock = resolveComposeSubmitBlock({
      isSignedIn: authPolicy.canCreateContent,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      hasInvalidRootTaskRelaySelection: !parentId && activeWritableRelayIds.length !== 1,
      t,
    });
    const replyBlock = resolveComposeSubmitBlock({
      isSignedIn: authPolicy.canCreateContent,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      hasInvalidRootCommentRelaySelection: activeWritableRelayIds.length === 0,
      t,
    });
    return { task: taskBlock, comment: replyBlock, offer: replyBlock, request: replyBlock };
  }, [activeWritableRelayIds, authPolicy.canCreateContent, parentId, t]);

  return {
    shouldHideComposer,
    activeWritableRelayIds,
    canCreateContent: authPolicy.canCreateContent,
    externalSubmitBlockByType,
  };
}
