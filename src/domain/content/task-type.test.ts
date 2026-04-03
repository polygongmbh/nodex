import { describe, expect, it } from "vitest";
import { normalizeComposerMessageType, normalizeTaskType } from "./task-type";

describe("normalizeTaskType", () => {
  it("keeps valid task types", () => {
    expect(normalizeTaskType("task")).toBe("task");
    expect(normalizeTaskType("comment")).toBe("comment");
  });

  it("normalizes case and whitespace for valid task types", () => {
    expect(normalizeTaskType(" TASK ")).toBe("task");
    expect(normalizeTaskType(" Comment ")).toBe("comment");
  });

  it("falls back to task for malformed values", () => {
    expect(normalizeTaskType(undefined)).toBe("task");
    expect(normalizeTaskType(null)).toBe("task");
    expect(normalizeTaskType("")).toBe("task");
    expect(normalizeTaskType("notes")).toBe("task");
    expect(normalizeTaskType({})).toBe("task");
  });
});

describe("normalizeComposerMessageType", () => {
  it("keeps all supported post types", () => {
    expect(normalizeComposerMessageType("task")).toBe("task");
    expect(normalizeComposerMessageType("comment")).toBe("comment");
    expect(normalizeComposerMessageType("offer")).toBe("offer");
    expect(normalizeComposerMessageType("request")).toBe("request");
  });

  it("falls back to task for malformed values", () => {
    expect(normalizeComposerMessageType(undefined)).toBe("task");
    expect(normalizeComposerMessageType("")).toBe("task");
    expect(normalizeComposerMessageType("listing")).toBe("task");
  });
});
