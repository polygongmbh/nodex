import { describe, expect, it } from "vitest";
import { VIEW_ORDER, resolveEnabledViews, resolveDefaultViewFor } from "./ViewSwitcher";

describe("resolveEnabledViews", () => {
  it("returns every view when nothing is configured", () => {
    expect(resolveEnabledViews(null)).toEqual(VIEW_ORDER);
    expect(resolveEnabledViews([])).toEqual(VIEW_ORDER);
  });

  it("filters to the configured views, preserving canonical order", () => {
    expect(resolveEnabledViews(["calendar", "feed"])).toEqual(["feed", "calendar"]);
  });

  it("ignores a config that matches no known view", () => {
    expect(resolveEnabledViews(["bogus", "nope"])).toEqual(VIEW_ORDER);
  });

  it("does not shrink VIEW_ORDER (every view stays URL-routable)", () => {
    resolveEnabledViews(["feed"]);
    expect(VIEW_ORDER).toEqual(["home", "status", "feed", "tree", "kanban", "list", "calendar"]);
  });
});

describe("resolveDefaultViewFor", () => {
  it("prefers the platform default when it is enabled", () => {
    expect(resolveDefaultViewFor(VIEW_ORDER, false)).toBe("home");
    expect(resolveDefaultViewFor(VIEW_ORDER, true)).toBe("status");
  });

  it("lands on the single enabled view on both platforms", () => {
    expect(resolveDefaultViewFor(["feed"], false)).toBe("feed");
    expect(resolveDefaultViewFor(["feed"], true)).toBe("feed");
  });

  it("falls back to the first enabled view (canonical order) when the preferred is disabled", () => {
    expect(resolveDefaultViewFor(["list", "calendar"], false)).toBe("list");
    expect(resolveDefaultViewFor(["list", "calendar"], true)).toBe("list");
  });

  it("skips desktop-only/non-mobile views for the mobile default", () => {
    expect(resolveDefaultViewFor(["home", "calendar"], true)).toBe("calendar");
  });
});
