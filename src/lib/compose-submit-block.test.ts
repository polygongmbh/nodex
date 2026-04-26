import { describe, expect, it } from "vitest";
import { resolveComposeSubmitBlock, shouldShowComposeSubmitBlockDetail } from "./compose-submit-block";

const t = ((key: string) => key) as never;

describe("compose-submit-block", () => {
  it("blocks top-level comments by missing writable posting context instead of requiring a parent task", () => {
    const block = resolveComposeSubmitBlock({
      isSignedIn: true,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      hasInvalidRootCommentRelaySelection: true,
      t,
    });

    expect(block?.code).toBe("commentRelay");
    expect(shouldShowComposeSubmitBlockDetail(block)).toBe(true);
  });

  it("does not block top-level comments when writable posting context exists", () => {
    const block = resolveComposeSubmitBlock({
      isSignedIn: true,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      t,
    });

    expect(block).toBeNull();
  });
});
