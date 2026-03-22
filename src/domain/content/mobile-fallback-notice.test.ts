import { describe, expect, it } from "vitest";
import { resolveMobileFallbackNoticeType } from "./mobile-fallback-notice";

describe("resolveMobileFallbackNoticeType", () => {
  it("returns none when there is no source content", () => {
    expect(
      resolveMobileFallbackNoticeType({
        hasSourceContent: false,
        hasScopeFilters: true,
        hasScopedMatchesWithSearch: false,
        hasScopedMatchesWithoutSearch: false,
        hasSearchQuery: true,
      })
    ).toBe("none");
  });

  it("prefers scope fallback over quick fallback when both are possible", () => {
    expect(
      resolveMobileFallbackNoticeType({
        hasSourceContent: true,
        hasScopeFilters: true,
        hasScopedMatchesWithSearch: false,
        hasScopedMatchesWithoutSearch: false,
        hasSearchQuery: true,
      })
    ).toBe("scope");
  });

  it("returns quick fallback only when scoped matches exist without search", () => {
    expect(
      resolveMobileFallbackNoticeType({
        hasSourceContent: true,
        hasScopeFilters: true,
        hasScopedMatchesWithSearch: false,
        hasScopedMatchesWithoutSearch: true,
        hasSearchQuery: true,
      })
    ).toBe("quick");
  });

  it("returns none when scoped matches exist with search", () => {
    expect(
      resolveMobileFallbackNoticeType({
        hasSourceContent: true,
        hasScopeFilters: true,
        hasScopedMatchesWithSearch: true,
        hasScopedMatchesWithoutSearch: true,
        hasSearchQuery: true,
      })
    ).toBe("none");
  });
});
