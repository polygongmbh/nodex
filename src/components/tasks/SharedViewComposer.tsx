import { useEffect, useRef } from "react";
import { TaskCreateComposer } from "./TaskCreateComposer";
import { isWritableRelay } from "./task-composer-runtime";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ComposeRestoreRequest, TaskInitialStatus } from "@/types";

interface SharedViewComposerProps {
  visible: boolean;
  onCancel?: () => void;
  focusedTaskId: string | null;
  initialStatus?: TaskInitialStatus;
  forceExpanded?: boolean;
  forceExpandSignal?: number;
  onExpandedChange?: (expanded: boolean) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  onMentionRequestConsumed?: (requestId: number) => void;
  defaultContent?: string;
  className?: string;
  collapseOnSuccess?: boolean;
  allowComment?: boolean;
  allowFeedMessageTypes?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

export function SharedViewComposer({
  visible,
  onCancel,
  focusedTaskId,
  initialStatus,
  forceExpanded = false,
  forceExpandSignal,
  onExpandedChange,
  mentionRequest = null,
  onMentionRequestConsumed,
  defaultContent = "",
  className = "relative z-20 border-b border-border px-2 sm:px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0",
  collapseOnSuccess = false,
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
}: SharedViewComposerProps) {
  const { t } = useTranslation();
  const authPolicy = useAuthActionPolicy();
  const { relays } = useFeedSurfaceState();
  const { allTasks } = useFeedTaskViewModel();
  const hasWarnedHiddenComposerRef = useRef(false);
  const parentTask = focusedTaskId ? allTasks.find((task) => task.id === focusedTaskId) : undefined;
  const shouldHideComposer =
    parentTask
    && parentTask.relays.length > 0
    && parentTask.relays.every((relayId) => !isWritableRelay(relays.find((relay) => relay.id === relayId)));

  useEffect(() => {
    if (!visible || !shouldHideComposer || !authPolicy.canCreateContent) {
      hasWarnedHiddenComposerRef.current = false;
      return;
    }
    if (hasWarnedHiddenComposerRef.current) return;
    hasWarnedHiddenComposerRef.current = true;
    toast.warning(t("toasts.warnings.readOnlyParentReplyHidden"));
  }, [authPolicy.canCreateContent, shouldHideComposer, t, visible]);

  if (!visible) return null;
  if (shouldHideComposer) return null;

  return (
    <div className={className} data-onboarding="focused-compose">
      <TaskCreateComposer
        onCancel={onCancel ?? (() => {})}
        compact
        focusedTaskId={focusedTaskId}
        initialStatus={initialStatus}
        adaptiveSize
        forceExpanded={forceExpanded}
        forceExpandSignal={forceExpandSignal}
        onExpandedChange={onExpandedChange}
        mentionRequest={mentionRequest}
        onMentionRequestConsumed={onMentionRequestConsumed}
        defaultContent={defaultContent}
        focusOnMount={false}
        collapseOnSuccess={collapseOnSuccess}
        allowComment={allowComment}
        allowFeedMessageTypes={allowFeedMessageTypes}
        composeRestoreRequest={composeRestoreRequest}
      />
    </div>
  );
}
