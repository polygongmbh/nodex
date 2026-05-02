import type { TFunction } from "i18next";

export type ComposeSubmitBlockCode =
  | "signin"
  | "write"
  | "tag"
  | "commentRelay"
  | "relay"
  | "uploading"
  | "uploadFailed";

export type ComposeSubmitBlockAction =
  | "focus-input"
  | "open-channel-selector"
  | "open-relay-selector"
  | "focus-attachments"
  | "review-blocker";

export interface ComposeSubmitBlockState {
  code: ComposeSubmitBlockCode;
  reason: string;
  ctaLabel: string;
  action: ComposeSubmitBlockAction | null;
  isHardDisabled: boolean;
}

export type ComposeSubmitBlockFocusTarget =
  | "input"
  | "attachments"
  | "blocker"
  | null;

interface ResolveComposeSubmitBlockOptions {
  isSignedIn: boolean;
  hasMeaningfulContent: boolean;
  hasAtLeastOneTag: boolean;
  canInheritParentTags: boolean;
  hasInvalidRootCommentRelaySelection: boolean;
  hasInvalidRootTaskRelaySelection: boolean;
  hasNoWritableSelectedRelays: boolean;
  hasPendingAttachmentUploads: boolean;
  hasFailedAttachmentUploads: boolean;
  t: TFunction;
}

export function resolveComposeSubmitBlock({
  isSignedIn,
  hasMeaningfulContent,
  hasAtLeastOneTag,
  canInheritParentTags,
  hasInvalidRootCommentRelaySelection,
  hasInvalidRootTaskRelaySelection,
  hasNoWritableSelectedRelays,
  hasPendingAttachmentUploads,
  hasFailedAttachmentUploads,
  t,
}: ResolveComposeSubmitBlockOptions): ComposeSubmitBlockState | null {
  if (!isSignedIn) {
    return {
      code: "signin",
      reason: t("composer.blocked.signin"),
      ctaLabel: t("composer.actions.signin"),
      action: null,
      isHardDisabled: false,
    };
  }

  if (hasFailedAttachmentUploads) {
    return {
      code: "uploadFailed",
      reason: t("composer.attachments.retryFailed"),
      ctaLabel: t("composer.blockedDetail.cta.uploadFailed"),
      action: "focus-attachments",
      isHardDisabled: false,
    };
  }

  if (!hasMeaningfulContent) {
    return {
      code: "write",
      reason: t("composer.blocked.write"),
      ctaLabel: t("composer.blockedDetail.cta.write"),
      action: "focus-input",
      isHardDisabled: false,
    };
  }

  if (!hasAtLeastOneTag && !canInheritParentTags) {
    return {
      code: "tag",
      reason: t("composer.blocked.tag"),
      ctaLabel: t("composer.blockedDetail.cta.tag"),
      action: "open-channel-selector",
      isHardDisabled: false,
    };
  }

  if (hasInvalidRootCommentRelaySelection) {
    return {
      code: "commentRelay",
      reason: hasNoWritableSelectedRelays
        ? t("composer.blocked.selectedSpacesNotWritable")
        : t("composer.blocked.rootPostPostingContext"),
      ctaLabel: t("composer.blockedDetail.cta.rootPostPostingContext"),
      action: "open-relay-selector",
      isHardDisabled: false,
    };
  }

  if (hasInvalidRootTaskRelaySelection) {
    return {
      code: "relay",
      reason: hasNoWritableSelectedRelays
        ? t("composer.blocked.selectedSpacesNotWritable")
        : t("composer.blocked.rootTaskExclusivePostingContext"),
      ctaLabel: t("composer.blockedDetail.cta.rootTaskExclusivePostingContext"),
      action: "open-relay-selector",
      isHardDisabled: false,
    };
  }

  if (hasPendingAttachmentUploads) {
    return {
      code: "uploading",
      reason: t("composer.blocked.uploading"),
      ctaLabel: t("composer.blockedDetail.cta.uploading"),
      action: "focus-attachments",
      isHardDisabled: false,
    };
  }

  return null;
}

export function getComposeSubmitBlockFocusTarget(
  block: ComposeSubmitBlockState | null
): ComposeSubmitBlockFocusTarget {
  switch (block?.action) {
    case "focus-input":
    case "open-channel-selector":
      return "input";
    case "focus-attachments":
      return "attachments";
    case "open-relay-selector":
    case "review-blocker":
      return "blocker";
    case null:
    case undefined:
      return null;
  }
}
