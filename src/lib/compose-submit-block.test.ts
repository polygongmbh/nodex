import { describe, expect, it } from "vitest";
import { resolveComposeSubmitBlock } from "./compose-submit-block";

const t = ((key: string, opts?: Record<string, string>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key) as never;

const baseOptions = {
  isSignedIn: true,
  hasMeaningfulContent: true,
  hasAtLeastOneTag: true,
  hasAtLeastOneCoreTag: true,
  coreChannels: [] as string[],
  canInheritParentTags: false,
  hasInvalidRootCommentRelaySelection: false,
  hasInvalidRootTaskRelaySelection: false,
  hasNoWritableSelectedRelays: false,
  hasPendingAttachmentUploads: false,
  hasFailedAttachmentUploads: false,
  t,
};

describe("compose-submit-block", () => {
  it("blocks top-level comments by missing writable posting context instead of requiring a parent task", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      canInheritParentTags: true,
      hasInvalidRootCommentRelaySelection: true,
    });

    expect(block?.code).toBe("commentRelay");
    expect(block?.action).toBe("open-relay-selector");
  });

  it("does not block top-level comments when writable posting context exists", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      canInheritParentTags: true,
    });

    expect(block).toBeNull();
  });

  it("uses the dedicated non-writable relay message when selected relays cannot be posted to", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      hasInvalidRootTaskRelaySelection: true,
      hasNoWritableSelectedRelays: true,
    });

    expect(block?.code).toBe("relay");
    expect(block?.reason).toBe("composer.blocked.selectedSpacesNotWritable");
  });

  it("prioritizes content blockers ahead of pending uploads", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      hasAtLeastOneTag: false,
      hasAtLeastOneCoreTag: false,
      hasPendingAttachmentUploads: true,
    });

    expect(block?.code).toBe("tag");
    expect(block?.action).toBe("open-channel-selector");
  });

  it("prioritizes the core-channel warning over the generic missing-tag warning", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      hasAtLeastOneTag: false,
      hasAtLeastOneCoreTag: false,
      coreChannels: ["team", "dev", "design"],
    });

    expect(block?.code).toBe("coreTag");
    expect(block?.action).toBe("open-channel-selector");
    expect(block?.reason).toContain("#team, #dev, #design");
  });

  it("warns about the missing core channel even when another tag is selected", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      hasAtLeastOneTag: true,
      hasAtLeastOneCoreTag: false,
      coreChannels: ["team", "dev"],
    });

    expect(block?.code).toBe("coreTag");
  });

  it("does not warn about core channels when none are configured", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      hasAtLeastOneCoreTag: false,
      coreChannels: [],
    });

    expect(block).toBeNull();
  });

  it("skips the core-channel warning when parent tags can be inherited", () => {
    const block = resolveComposeSubmitBlock({
      ...baseOptions,
      hasAtLeastOneTag: false,
      hasAtLeastOneCoreTag: false,
      coreChannels: ["team"],
      canInheritParentTags: true,
    });

    expect(block).toBeNull();
  });
});
