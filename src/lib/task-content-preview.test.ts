import { describe, expect, it } from "vitest";
import {
  getCollapsedTaskContentPreview,
  getFirstTaskContentLine,
  getTaskContentLines,
  getTaskTooltipPreview,
  getTrimmedFirstTaskContentLine,
  shouldCollapseTaskContent,
  TASK_TOOLTIP_PREVIEW_MAX,
} from "./task-content-preview";

describe("task-content-preview", () => {
  it("returns split lines for task content", () => {
    expect(getTaskContentLines("one\ntwo\r\nthree")).toEqual(["one", "two", "three"]);
  });

  it("returns only the first line for compact previews", () => {
    expect(getFirstTaskContentLine("alpha\nbeta\ngamma")).toBe("alpha");
  });

  it("returns the trimmed first line for tooltip and compact-label uses", () => {
    expect(getTrimmedFirstTaskContentLine("\n \n  alpha  \n beta")).toBe("alpha");
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

  describe("getTaskTooltipPreview", () => {
    it("returns short content unchanged", () => {
      expect(getTaskTooltipPreview("hello world")).toBe("hello world");
    });

    it("collapses internal whitespace and trims", () => {
      expect(getTaskTooltipPreview("  alpha\n\nbeta\t\tgamma  ")).toBe("alpha beta gamma");
    });

    it("truncates long content with an ellipsis", () => {
      const long = "a".repeat(TASK_TOOLTIP_PREVIEW_MAX + 50);
      const result = getTaskTooltipPreview(long);
      expect(result.endsWith("…")).toBe(true);
      expect(result.length).toBe(TASK_TOOLTIP_PREVIEW_MAX);
    });

    it("returns empty string for empty or nullish input", () => {
      expect(getTaskTooltipPreview("")).toBe("");
      expect(getTaskTooltipPreview("   \n\t  ")).toBe("");
      expect(getTaskTooltipPreview(null)).toBe("");
      expect(getTaskTooltipPreview(undefined)).toBe("");
    });
  });
});
