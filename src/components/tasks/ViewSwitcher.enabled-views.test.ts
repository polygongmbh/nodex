import { afterEach, describe, expect, it, vi } from "vitest";

// ENABLED_VIEWS / isSingleViewMode / resolveDefaultView are resolved from
// VITE_VIEWS at module load, so each case stubs the env and re-imports.
async function loadViewSwitcher(views?: string) {
  vi.resetModules();
  if (views === undefined) {
    vi.unstubAllEnvs();
  } else {
    vi.stubEnv("VITE_VIEWS", views);
  }
  return import("./ViewSwitcher");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("ViewSwitcher enabled-view resolution", () => {
  it("enables every view when VITE_VIEWS is unset", async () => {
    const m = await loadViewSwitcher(undefined);
    expect(m.ENABLED_VIEWS).toEqual(["home", "status", "feed", "tree", "kanban", "list", "calendar"]);
    expect(m.isSingleViewMode).toBe(false);
  });

  it("filters to configured views, preserving canonical order", async () => {
    const m = await loadViewSwitcher("calendar, feed");
    expect(m.ENABLED_VIEWS).toEqual(["feed", "calendar"]);
    expect(m.isSingleViewMode).toBe(false);
  });

  it("flags single-view mode and lands on that view on both platforms", async () => {
    const m = await loadViewSwitcher("feed");
    expect(m.isSingleViewMode).toBe(true);
    expect(m.resolveDefaultView(false)).toBe("feed");
    expect(m.resolveDefaultView(true)).toBe("feed");
  });

  it("falls back to the first enabled view (canonical order) when the preferred default is disabled", async () => {
    const m = await loadViewSwitcher("calendar,list");
    // ENABLED_VIEWS keeps canonical order → ["list", "calendar"].
    expect(m.resolveDefaultView(false)).toBe("list"); // home disabled
    expect(m.resolveDefaultView(true)).toBe("list"); // status disabled
  });

  it("ignores a config that matches no known view", async () => {
    const m = await loadViewSwitcher("bogus,nope");
    expect(m.ENABLED_VIEWS).toHaveLength(7);
  });
});
