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
});
