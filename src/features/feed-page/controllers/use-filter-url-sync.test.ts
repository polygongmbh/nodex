import { describe, expect, it } from "vitest";
import {
  buildFilterSearchParams,
  mergeFilterSearchParams,
  parseFilterSearchParams,
} from "./use-filter-url-sync";
import type { Person } from "@/types/person";

describe("parseFilterSearchParams", () => {
  it("returns null when no filter params present", () => {
    const params = new URLSearchParams();
    const result = parseFilterSearchParams(params);
    expect(result.channelFilters).toBeNull();
    expect(result.selectedPersonIds).toBeNull();
  });

  it("parses included channels", () => {
    const params = new URLSearchParams("ch=alpha,beta");
    const result = parseFilterSearchParams(params);
    expect(result.channelFilters).toEqual(
      new Map([
        ["alpha", "included"],
        ["beta", "included"],
      ])
    );
  });

  it("parses excluded channels", () => {
    const params = new URLSearchParams("ex=spam");
    const result = parseFilterSearchParams(params);
    expect(result.channelFilters).toEqual(new Map([["spam", "excluded"]]));
  });

  it("parses both included and excluded channels", () => {
    const params = new URLSearchParams("ch=alpha&ex=spam");
    const result = parseFilterSearchParams(params);
    expect(result.channelFilters?.get("alpha")).toBe("included");
    expect(result.channelFilters?.get("spam")).toBe("excluded");
  });

  it("parses selected people", () => {
    const params = new URLSearchParams("p=abc123,def456");
    const result = parseFilterSearchParams(params);
    expect(result.selectedPersonIds).toEqual(new Set(["abc123", "def456"]));
  });

  it("handles empty values gracefully", () => {
    const params = new URLSearchParams("ch=&p=");
    const result = parseFilterSearchParams(params);
    expect(result.channelFilters?.size).toBe(0);
    expect(result.selectedPersonIds?.size).toBe(0);
  });
});

describe("buildFilterSearchParams", () => {
  const makePerson = (id: string, isSelected: boolean): Person => ({
    id,
    name: id,
    displayName: id,
    isOnline: false,
    isSelected,
  });

  it("builds empty params when no filters active", () => {
    const params = buildFilterSearchParams(new Map(), [makePerson("a", false)]);
    expect(params.toString()).toBe("");
  });

  it("builds ch param for included channels", () => {
    const filters = new Map<string, "included" | "excluded" | "neutral">([
      ["beta", "included"],
      ["alpha", "included"],
      ["gamma", "neutral"],
    ]);
    const params = buildFilterSearchParams(filters, []);
    expect(params.get("ch")).toBe("alpha,beta"); // sorted
    expect(params.has("ex")).toBe(false);
  });

  it("builds ex param for excluded channels", () => {
    const filters = new Map<string, "included" | "excluded" | "neutral">([
      ["spam", "excluded"],
    ]);
    const params = buildFilterSearchParams(filters, []);
    expect(params.get("ex")).toBe("spam");
  });

  it("builds p param for selected people", () => {
    const people = [makePerson("z", true), makePerson("a", true), makePerson("m", false)];
    const params = buildFilterSearchParams(new Map(), people);
    expect(params.get("p")).toBe("a,z"); // sorted
  });

  it("roundtrips through parse", () => {
    const filters = new Map<string, "included" | "excluded" | "neutral">([
      ["dev", "included"],
      ["spam", "excluded"],
    ]);
    const people = [makePerson("pub1", true), makePerson("pub2", false)];
    const params = buildFilterSearchParams(filters, people);
    const parsed = parseFilterSearchParams(params);
    expect(parsed.channelFilters?.get("dev")).toBe("included");
    expect(parsed.channelFilters?.get("spam")).toBe("excluded");
    expect(parsed.selectedPersonIds).toEqual(new Set(["pub1"]));
  });
});

describe("mergeFilterSearchParams", () => {
  it("preserves unrelated params while replacing filter params", () => {
    const current = new URLSearchParams("view=feed&ch=old&p=alice");
    const nextFilters = new URLSearchParams("ex=spam&p=bob");

    const merged = mergeFilterSearchParams(current, nextFilters);

    expect(merged.toString()).toBe("view=feed&ex=spam&p=bob");
  });

  it("removes stale filter params when filters are cleared", () => {
    const current = new URLSearchParams("view=feed&ch=alpha&ex=spam&p=bob");
    const merged = mergeFilterSearchParams(current, new URLSearchParams());

    expect(merged.toString()).toBe("view=feed");
  });

  it("keeps an identical query string identical after merging", () => {
    const current = new URLSearchParams("view=feed&ch=alpha&ex=spam&p=bob");
    const nextFilters = new URLSearchParams("ch=alpha&ex=spam&p=bob");

    const merged = mergeFilterSearchParams(current, nextFilters);

    expect(merged.toString()).toBe(current.toString());
  });
});
