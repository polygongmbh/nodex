import { describe, expect, it } from "vitest";
import { resolveComposeSubmitBlock } from "./compose-submit-block";

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
    expect(block?.action).toBe("open-relay-selector");
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

  it("prioritizes content blockers ahead of pending uploads", () => {
    const block = resolveComposeSubmitBlock({
      isSignedIn: true,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: false,
      canInheritParentTags: false,
      hasPendingAttachmentUploads: true,
      hasFailedAttachmentUploads: false,
      t,
    });

    expect(block?.code).toBe("tag");
    expect(block?.action).toBe("open-channel-selector");
  });
});
