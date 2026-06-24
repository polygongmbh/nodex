import { describe, expect, it } from "vitest";
import { buildDocumentTitle } from "@/lib/document-title";

describe("buildDocumentTitle", () => {
  it("shows the focused task content over the view label", () => {
    expect(
      buildDocumentTitle({
        focusedTaskContent: "Fix login redirect",
        viewLabel: "Kanban",
        host: "talk.nodex.io",
      })
    ).toBe("Fix login redirect — talk.nodex.io");
  });

  it("falls back to the view label when no task is focused", () => {
    expect(
      buildDocumentTitle({ focusedTaskContent: null, viewLabel: "Kanban", host: "talk.nodex.io" })
    ).toBe("Kanban — talk.nodex.io");
  });

  it("keeps the host with its port so dev instances differ", () => {
    expect(
      buildDocumentTitle({ focusedTaskContent: null, viewLabel: "Timeline", host: "localhost:8080" })
    ).toBe("Timeline — localhost:8080");
  });

  it("strips mentions and markdown from task content", () => {
    expect(
      buildDocumentTitle({
        focusedTaskContent: "@alice please review **the** #deploy",
        viewLabel: "Tree",
        host: "nodex.io",
      })
    ).toBe("please review the deploy — nodex.io");
  });

  it("truncates long task content with an ellipsis", () => {
    const title = buildDocumentTitle({
      focusedTaskContent: "a".repeat(120),
      viewLabel: "Feed",
      host: "nodex.io",
    });
    expect(title.endsWith("… — nodex.io")).toBe(true);
    expect(title.length).toBeLessThan(120);
  });

  it("uses the brand as a last resort when there is no context or host", () => {
    expect(buildDocumentTitle({ focusedTaskContent: null, viewLabel: "", host: "" })).toBe("Nodex");
  });
});
