import { describe, expect, it } from "vitest";
import { formatBreadcrumbLabel } from "./breadcrumb-label";

describe("formatBreadcrumbLabel", () => {
  it("uses only the first line, removes mentions, and strips markup formatting markers", () => {
    const label = formatBreadcrumbLabel("Ship @alice #frontend now!!!\nSecond line #ignored");
    expect(label).toBe("Ship frontend now!!!");
  });

  it("ignores leading blank lines and whitespace before taking the first line", () => {
    expect(formatBreadcrumbLabel("\n \n   Ship #frontend now\nSecond line")).toBe("Ship frontend now");
  });

  it("keeps hashtag words while removing hashtag markers", () => {
    expect(formatBreadcrumbLabel("#backend #ops rollout")).toBe("backend ops rollout");
  });

  it("preserves ordinary punctuation while removing markdown-style markers", () => {
    expect(formatBreadcrumbLabel("Review, **please** ~~now~~. #frontend *soon*")).toBe("Review, please now. frontend soon");
  });

  it("removes raw nostr npub mention tokens with the shared mention regex", () => {
    expect(formatBreadcrumbLabel("nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq can you try implementing this")).toBe("can you try implementing this");
  });
});
