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
      hasInvalidRootCommentRelaySelection: true,
      hasInvalidRootTaskRelaySelection: false,
      hasNoWritableSelectedRelays: false,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
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
      hasInvalidRootCommentRelaySelection: false,
      hasInvalidRootTaskRelaySelection: false,
      hasNoWritableSelectedRelays: false,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      t,
    });

    expect(block).toBeNull();
  });

  it("uses the dedicated non-writable relay message when selected relays cannot be posted to", () => {
    const block = resolveComposeSubmitBlock({
      isSignedIn: true,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: true,
      canInheritParentTags: false,
      hasInvalidRootCommentRelaySelection: false,
      hasInvalidRootTaskRelaySelection: true,
      hasNoWritableSelectedRelays: true,
      hasPendingAttachmentUploads: false,
      hasFailedAttachmentUploads: false,
      t,
    });

    expect(block?.code).toBe("relay");
    expect(block?.reason).toBe("composer.blocked.selectedSpacesNotWritable");
  });

  it("prioritizes content blockers ahead of pending uploads", () => {
    const block = resolveComposeSubmitBlock({
      isSignedIn: true,
      hasMeaningfulContent: true,
      hasAtLeastOneTag: false,
      canInheritParentTags: false,
      hasInvalidRootCommentRelaySelection: false,
      hasInvalidRootTaskRelaySelection: false,
      hasNoWritableSelectedRelays: false,
      hasPendingAttachmentUploads: true,
      hasFailedAttachmentUploads: false,
      t,
    });

    expect(block?.code).toBe("tag");
    expect(block?.action).toBe("open-channel-selector");
  });
});
