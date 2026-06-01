import { useEffect, useRef } from "react";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { isWritableRelay } from "./task-composer-runtime";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { usePosts } from "@/features/feed-page/stores/posts-store";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { PostType } from "@/types";

const DEFAULT_ALLOWED_POST_TYPES: readonly PostType[] = ["task", "comment"];

interface SharedViewComposerProps {
  focusedTaskId: string | null;
  onExpandedChange?: (expanded: boolean) => void;
  defaultContent?: string;
  className?: string;
  collapseOnSuccess?: boolean;
  allowedPostTypes?: readonly PostType[];
}

export function SharedViewComposer({
  focusedTaskId,
  onExpandedChange,
  defaultContent = "",
  className = "relative z-20 border-b border-border px-2 sm:px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0",
  collapseOnSuccess = false,
  allowedPostTypes = DEFAULT_ALLOWED_POST_TYPES,
}: SharedViewComposerProps) {
  const { t } = useTranslation("composer");
  const authPolicy = useAuthActionPolicy();
  const { relays } = useFeedSurfaceState();
  const posts = usePosts();
  const hasWarnedHiddenComposerRef = useRef(false);
  const parentTask = focusedTaskId ? posts.find((post) => post.id === focusedTaskId) : undefined;
  const shouldHideComposer =
    parentTask
    && parentTask.relays.length > 0
    && parentTask.relays.every((relayId) => !isWritableRelay(relays.find((relay) => relay.id === relayId)));

  useEffect(() => {
    if (!shouldHideComposer || !authPolicy.canCreateContent) {
      hasWarnedHiddenComposerRef.current = false;
      return;
    }
    if (hasWarnedHiddenComposerRef.current) return;
    hasWarnedHiddenComposerRef.current = true;
    toast.warning(t("toasts.warnings.readOnlyParentReplyHidden"));
  }, [authPolicy.canCreateContent, shouldHideComposer, t]);

  if (shouldHideComposer) return null;

  return (
    <div className={className} data-onboarding="focused-compose">
      <TaskCreateComposer
        onCancel={() => {}}
        compact
        focusedTaskId={focusedTaskId}
        adaptiveSize
        onExpandedChange={onExpandedChange}
        defaultContent={defaultContent}
        focusOnMount={false}
        collapseOnSuccess={collapseOnSuccess}
        allowedPostTypes={allowedPostTypes}
      />
    </div>
  );
}
