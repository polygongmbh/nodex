import { describe, expect, it } from "vitest";
import {
  getCollapsedTaskContentPreview,
  getFirstTaskContentLine,
  getTaskContentLines,
  shouldCollapseTaskContent,
} from "./task-content-preview";

describe("task-content-preview", () => {
  it("returns split lines for task content", () => {
    expect(getTaskContentLines("one\ntwo\r\nthree")).toEqual(["one", "two", "three"]);
  });

  it("returns only the first line for compact previews", () => {
    expect(getFirstTaskContentLine("alpha\nbeta\ngamma")).toBe("alpha");
  });

  it("collapses only when content has more than four lines", () => {
    expect(shouldCollapseTaskContent("1\n2\n3\n4")).toBe(false);
    expect(shouldCollapseTaskContent("1\n2\n3\n4\n5")).toBe(true);
  });

  it("collapses when content exceeds 500 characters even without many newlines", () => {
    expect(shouldCollapseTaskContent("a".repeat(500))).toBe(false);
    expect(shouldCollapseTaskContent("a".repeat(501))).toBe(true);
  });

  it("returns the first three lines for collapsed preview", () => {
    expect(getCollapsedTaskContentPreview("1\n2\n3\n4\n5")).toBe("1\n2\n3");
  });
});
