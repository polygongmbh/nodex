import { describe, expect, it } from "vitest";
import { buildTaskPublishTags } from "./task-publish-tags";

describe("buildTaskPublishTags", () => {
  it("includes parent and due tags for task publish", () => {
    const dueDate = new Date("2026-03-20T00:00:00.000Z");
    const tags = buildTaskPublishTags("parent123", "wss://relay.example", dueDate, "14:30");

    expect(tags).toContainEqual(["e", "parent123", "wss://relay.example", "parent"]);
    expect(tags).toContainEqual(["due", String(Math.floor(dueDate.getTime() / 1000))]);
    expect(tags).toContainEqual(["due_time", "14:30"]);
  });

  it("omits empty due_time", () => {
    const dueDate = new Date("2026-03-21T00:00:00.000Z");
    const tags = buildTaskPublishTags(undefined, undefined, dueDate, "   ");

    expect(tags).toContainEqual(["due", String(Math.floor(dueDate.getTime() / 1000))]);
    expect(tags.find((tag) => tag[0] === "due_time")).toBeUndefined();
  });
});
