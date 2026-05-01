import { useMemo } from "react";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { resolveComposeSubmitBlock, type ComposeSubmitBlockState } from "@/lib/compose-submit-block";
import { resolveEffectiveWritableRelayIds } from "@/lib/nostr/task-relay-routing";
import { isWritableRelay } from "./task-composer-runtime";
import { useTranslation } from "react-i18next";
import type { PostType } from "@/types";

export interface ComposerRelayBlock {
  shouldHideComposer: boolean;
  effectiveWritableRelayIds: string[];
  canCreateContent: boolean;
  externalSubmitBlockByType: Partial<Record<PostType, ComposeSubmitBlockState | null>>;
}

export function useComposerRelayBlock(focusedTaskId: string | null): ComposerRelayBlock {
  const { relays } = useFeedSurfaceState();
  const { allTasks } = useFeedTaskViewModel();
  const authPolicy = useAuthActionPolicy();
  const { t } = useTranslation("composer");

  const parentTask = useMemo(
    () => (focusedTaskId ? allTasks.find((task) => task.id === focusedTaskId) : undefined),
    [allTasks, focusedTaskId]
  );

  const shouldHideComposer = useMemo(() => {
    if (!parentTask || parentTask.relays.length === 0) return false;
    const relaysById = new Map(relays.map((relay) => [relay.id, relay] as const));
    return parentTask.relays.every((relayId) => !isWritableRelay(relaysById.get(relayId)));
  }, [parentTask, relays]);

  const activeRelayIds = useMemo(
    () => relays.filter((relay) => relay.isActive).map((relay) => relay.id),
    [relays]
  );
  const activeWritableRelayIds = useMemo(
    () => relays.filter((relay) => relay.isActive && isWritableRelay(relay)).map((relay) => relay.id),
    [relays]
  );
  const effectiveWritableRelayIds = useMemo(
    () => resolveEffectiveWritableRelayIds({ selectedRelayIds: activeRelayIds, relays }),
    [activeRelayIds, relays]
  );
  const hasNoWritableSelectedSpaces = activeRelayIds.length > 0 && activeWritableRelayIds.length === 0;

  const externalSubmitBlockByType = useMemo<Partial<Record<PostType, ComposeSubmitBlockState | null>>>(() => {
    const taskBlock = resolveComposeSubmitBlock({
      isSignedIn: authPolicy.canCreateContent,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      hasInvalidRootTaskRelaySelection: !focusedTaskId && effectiveWritableRelayIds.length !== 1,
      hasNoWritableSelectedSpaces,
      t,
    });
    const replyBlock = resolveComposeSubmitBlock({
      isSignedIn: authPolicy.canCreateContent,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      hasInvalidRootCommentRelaySelection: !focusedTaskId && effectiveWritableRelayIds.length === 0,
      hasNoWritableSelectedSpaces,
      t,
    });
    return { task: taskBlock, comment: replyBlock, offer: replyBlock, request: replyBlock };
  }, [
    authPolicy.canCreateContent,
    effectiveWritableRelayIds,
    focusedTaskId,
    hasNoWritableSelectedSpaces,
    t,
  ]);

  return {
    shouldHideComposer,
    effectiveWritableRelayIds,
    canCreateContent: authPolicy.canCreateContent,
    externalSubmitBlockByType,
  };
}
