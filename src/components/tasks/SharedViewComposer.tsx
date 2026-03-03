import { TaskComposer } from "./TaskComposer";
import type {
  Channel,
  Person,
  Relay,
  ComposerSubmit,
  ComposeRestoreRequest,
} from "@/types";

interface SharedViewComposerProps {
  visible: boolean;
  relays: Relay[];
  channels: Channel[];
  composeChannels?: Channel[];
  people: Person[];
  onSubmit: ComposerSubmit;
  onCancel?: () => void;
  draftStorageKey: string;
  parentId?: string;
  onSignInClick?: () => void;
  forceExpanded?: boolean;
  forceExpandSignal?: number;
  onExpandedChange?: (expanded: boolean) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  defaultContent?: string;
  className?: string;
  allowComment?: boolean;
  allowFeedMessageTypes?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

export function SharedViewComposer({
  visible,
  relays,
  channels,
  composeChannels,
  people,
  onSubmit,
  onCancel,
  draftStorageKey,
  parentId,
  onSignInClick,
  forceExpanded = false,
  forceExpandSignal,
  onExpandedChange,
  mentionRequest = null,
  defaultContent = "",
  className = "relative z-20 border-b border-border px-4 py-3 bg-background/95 backdrop-blur-sm flex-shrink-0",
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
}: SharedViewComposerProps) {
  if (!visible) return null;

  return (
    <div className={className} data-onboarding="focused-compose">
      <TaskComposer
        onSubmit={onSubmit}
        relays={relays}
        channels={composeChannels || channels}
        people={people}
        onCancel={onCancel ?? (() => {})}
        compact
        adaptiveSize
        draftStorageKey={draftStorageKey}
        parentId={parentId}
        onSignInClick={onSignInClick}
        forceExpanded={forceExpanded}
        forceExpandSignal={forceExpandSignal}
        onExpandedChange={onExpandedChange}
        mentionRequest={mentionRequest}
        defaultContent={defaultContent}
        allowComment={allowComment}
        allowFeedMessageTypes={allowFeedMessageTypes}
        composeRestoreRequest={composeRestoreRequest}
      />
    </div>
  );
}
