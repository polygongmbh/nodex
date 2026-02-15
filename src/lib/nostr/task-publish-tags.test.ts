import { describe, expect, it } from "vitest";
import { buildTaskPublishTags } from "./task-publish-tags";

describe("buildTaskPublishTags", () => {
  it("includes parent tag for task publish", () => {
    const tags = buildTaskPublishTags("parent123", "wss://relay.example");

    expect(tags).toContainEqual(["e", "parent123", "wss://relay.example", "parent"]);
  });

  it("returns empty list when no parent is provided", () => {
    const tags = buildTaskPublishTags(undefined, undefined);
    expect(tags).toEqual([]);
  });

  it("appends deduplicated person tags for mentions", () => {
    const tags = buildTaskPublishTags(undefined, undefined, [
      "ABCDEF",
      "abcdef",
      "123456",
    ]);

    expect(tags).toEqual([["p", "abcdef"], ["p", "123456"]]);
  });
});
