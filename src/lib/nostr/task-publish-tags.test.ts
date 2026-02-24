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

  it("appends deduplicated lowercase t tags from selected channels", () => {
    const tags = buildTaskPublishTags(
      undefined,
      undefined,
      [],
      undefined,
      ["Backend", "backend", "ops", "  "]
    );

    expect(tags).toEqual([["t", "backend"], ["t", "ops"]]);
  });

  it("combines parent, mentions, priority, and channel tags", () => {
    const tags = buildTaskPublishTags(
      "task123",
      "wss://relay.example",
      ["ALICE"],
      7,
      ["release"]
    );

    expect(tags).toEqual([
      ["e", "task123", "wss://relay.example", "parent"],
      ["p", "alice"],
      ["priority", "7"],
      ["t", "release"],
    ]);
  });

  it("appends normalized imeta tags for attachments", () => {
    const tags = buildTaskPublishTags(
      undefined,
      undefined,
      [],
      undefined,
      [],
      [
        {
          url: "https://cdn.example.com/path/image.png",
          mimeType: "image/png",
          sha256: "abc123",
          size: 12,
          dimensions: "10x10",
          alt: "Example image",
        },
        {
          url: "https://cdn.example.com/path/image.png",
        },
      ]
    );

    expect(tags).toEqual([
      [
        "imeta",
        "url https://cdn.example.com/path/image.png",
        "m image/png",
        "x abc123",
        "size 12",
        "dim 10x10",
        "alt Example image",
      ],
    ]);
  });
});
