import { describe, expect, it } from "vitest";
import { resolveSubmissionTags } from "./submission-tags";

describe("resolveSubmissionTags", () => {
  it("uses normalized explicit tags when present", () => {
    const result = resolveSubmissionTags(["Backend", " backend ", "Infra"]);

    expect(result).toEqual({
      submissionTags: ["backend", "infra"],
      usedParentFallback: false,
    });
  });

  it("falls back to normalized parent tags when explicit tags are empty", () => {
    const result = resolveSubmissionTags([], { tags: ["Ops", " ops ", "Release"] });

    expect(result).toEqual({
      submissionTags: ["ops", "release"],
      usedParentFallback: true,
    });
  });

  it("returns empty tags when neither explicit nor parent tags are available", () => {
    const result = resolveSubmissionTags([], { tags: [] });

    expect(result).toEqual({
      submissionTags: [],
      usedParentFallback: false,
    });
  });
});
