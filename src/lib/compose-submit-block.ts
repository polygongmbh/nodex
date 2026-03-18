import type { TFunction } from "i18next";

export type ComposeSubmitBlockCode =
  | "signin"
  | "write"
  | "tag"
  | "selectTask"
  | "commentRelay"
  | "relay"
  | "uploading"
  | "uploadFailed"
  | "publishing";

export type ComposeSubmitBlockAction =
  | "focus-input"
  | "open-channel-selector"
  | "open-relay-selector"
  | "focus-attachments"
  | "focus-task-context"
  | "review-blocker";

export interface ComposeSubmitBlockState {
  code: ComposeSubmitBlockCode;
  reason: string;
  detail: string;
  ctaLabel: string;
  action: ComposeSubmitBlockAction | null;
  isHardDisabled: boolean;
}

interface ResolveComposeSubmitBlockOptions {
  isSignedIn: boolean;
  hasMeaningfulContent: boolean;
  hasAtLeastOneTag: boolean;
  canInheritParentTags: boolean;
  hasCommentWithoutParent?: boolean;
  hasInvalidRootCommentRelaySelection?: boolean;
  hasInvalidRootTaskRelaySelection?: boolean;
  hasPendingAttachmentUploads: boolean;
  hasFailedAttachmentUploads: boolean;
  isPublishing?: boolean;
  t: TFunction;
}

export function resolveComposeSubmitBlock({
  isSignedIn,
  hasMeaningfulContent,
  hasAtLeastOneTag,
  canInheritParentTags,
  hasCommentWithoutParent = false,
  hasInvalidRootCommentRelaySelection = false,
  hasInvalidRootTaskRelaySelection = false,
  hasPendingAttachmentUploads,
  hasFailedAttachmentUploads,
  isPublishing = false,
  t,
}: ResolveComposeSubmitBlockOptions): ComposeSubmitBlockState | null {
  if (!isSignedIn) {
    return {
      code: "signin",
      reason: t("composer.blocked.signin"),
      detail: t("composer.blockedDetail.detail.signin"),
      ctaLabel: t("composer.actions.signin"),
      action: null,
      isHardDisabled: false,
    };
  }

  if (hasPendingAttachmentUploads) {
    return {
      code: "uploading",
      reason: t("composer.attachments.waitForUploads"),
      detail: t("composer.blockedDetail.detail.uploading"),
      ctaLabel: t("composer.blockedDetail.cta.uploading"),
      action: "focus-attachments",
      isHardDisabled: false,
    };
  }

  if (hasFailedAttachmentUploads) {
    return {
      code: "uploadFailed",
      reason: t("composer.attachments.retryFailed"),
      detail: t("composer.blockedDetail.detail.uploadFailed"),
      ctaLabel: t("composer.blockedDetail.cta.uploadFailed"),
      action: "focus-attachments",
      isHardDisabled: false,
    };
  }

  if (!hasMeaningfulContent) {
    return {
      code: "write",
      reason: t("composer.blocked.write"),
      detail: t("composer.blockedDetail.detail.write"),
      ctaLabel: t("composer.blockedDetail.cta.write"),
      action: "focus-input",
      isHardDisabled: false,
    };
  }

  if (!hasAtLeastOneTag && !canInheritParentTags) {
    return {
      code: "tag",
      reason: t("composer.blocked.tag"),
      detail: t("composer.blockedDetail.detail.tag"),
      ctaLabel: t("composer.blockedDetail.cta.tag"),
      action: "open-channel-selector",
      isHardDisabled: false,
    };
  }

  if (hasCommentWithoutParent) {
    return {
      code: "selectTask",
      reason: t("composer.blocked.selectTask"),
      detail: t("composer.blockedDetail.detail.selectTask"),
      ctaLabel: t("composer.blockedDetail.cta.selectTask"),
      action: "focus-task-context",
      isHardDisabled: false,
    };
  }

  if (hasInvalidRootCommentRelaySelection) {
    return {
      code: "commentRelay",
      reason: t("composer.blocked.commentRelay"),
      detail: t("composer.blockedDetail.detail.commentRelay"),
      ctaLabel: t("composer.blockedDetail.cta.commentRelay"),
      action: "open-relay-selector",
      isHardDisabled: false,
    };
  }

  if (hasInvalidRootTaskRelaySelection) {
    return {
      code: "relay",
      reason: t("composer.blocked.relay"),
      detail: t("composer.blockedDetail.detail.relay"),
      ctaLabel: t("composer.blockedDetail.cta.relay"),
      action: "open-relay-selector",
      isHardDisabled: false,
    };
  }

  if (isPublishing) {
    return {
      code: "publishing",
      reason: t("composer.blocked.publishing"),
      detail: t("composer.blockedDetail.detail.publishing"),
      ctaLabel: t("composer.blockedDetail.cta.publishing"),
      action: null,
      isHardDisabled: true,
    };
  }

  return null;
}
