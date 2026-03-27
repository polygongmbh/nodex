import { describe, expect, it } from "vitest";
import { formatBreadcrumbLabel } from "./breadcrumb-label";

describe("formatBreadcrumbLabel", () => {
  it("uses only the first line, removes mentions, and strips symbol formatting", () => {
    const label = formatBreadcrumbLabel("Ship @alice #frontend now!!!\nSecond line #ignored");
    expect(label).toBe("Ship frontend now");
  });

  it("ignores leading blank lines and whitespace before taking the first line", () => {
    expect(formatBreadcrumbLabel("\n \n   Ship #frontend now\nSecond line")).toBe("Ship frontend now");
  });

  it("keeps hashtag words while removing hashtag markers", () => {
    expect(formatBreadcrumbLabel("#backend #ops rollout")).toBe("backend ops rollout");
  });
});
