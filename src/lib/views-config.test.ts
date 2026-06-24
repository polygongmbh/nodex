import { describe, expect, it } from "vitest";
import { parseConfiguredViewNames } from "./views-config";

describe("parseConfiguredViewNames", () => {
  it("returns null when unset or empty", () => {
    expect(parseConfiguredViewNames(undefined)).toBeNull();
    expect(parseConfiguredViewNames(null)).toBeNull();
    expect(parseConfiguredViewNames("")).toBeNull();
    expect(parseConfiguredViewNames("  ,  , ")).toBeNull();
  });

  it("splits, trims, lowercases, and drops blanks", () => {
    expect(parseConfiguredViewNames(" Feed , STATUS ,, calendar ")).toEqual([
      "feed",
      "status",
      "calendar",
    ]);
  });
});
