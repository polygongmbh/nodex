import { TaskCreateComposer } from "./TaskCreateComposer";
import type {
  ComposeRestoreRequest,
  TaskInitialStatus,
} from "@/types";

interface SharedViewComposerProps {
  visible: boolean;
  onCancel?: () => void;
  draftStorageKey: string;
  parentId?: string;
  initialStatus?: TaskInitialStatus;
  forceExpanded?: boolean;
  forceExpandSignal?: number;
  onExpandedChange?: (expanded: boolean) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
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
  draftStorageKey,
  parentId,
  initialStatus,
  forceExpanded = false,
  forceExpandSignal,
  onExpandedChange,
  mentionRequest = null,
  defaultContent = "",
  className = "relative z-20 border-b border-border px-2 sm:px-3 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0",
  collapseOnSuccess = false,
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
}: SharedViewComposerProps) {
  if (!visible) return null;

  return (
    <div className={className} data-onboarding="focused-compose">
      <TaskCreateComposer
        onCancel={onCancel ?? (() => {})}
        compact
        draftStorageKey={draftStorageKey}
        parentId={parentId}
        initialStatus={initialStatus}
        adaptiveSize
        forceExpanded={forceExpanded}
        forceExpandSignal={forceExpandSignal}
        onExpandedChange={onExpandedChange}
        mentionRequest={mentionRequest}
        defaultContent={defaultContent}
        collapseOnSuccess={collapseOnSuccess}
        allowComment={allowComment}
        allowFeedMessageTypes={allowFeedMessageTypes}
        composeRestoreRequest={composeRestoreRequest}
      />
    </div>
  );
}
