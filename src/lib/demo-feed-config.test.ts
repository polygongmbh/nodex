import { describe, expect, it } from "vitest";
import { isDemoFeedEnabled } from "./demo-feed-config";

describe("isDemoFeedEnabled", () => {
  it("returns false by default", () => {
    expect(isDemoFeedEnabled(undefined)).toBe(false);
    expect(isDemoFeedEnabled("")).toBe(false);
  });

  it("returns true only for explicit true values", () => {
    expect(isDemoFeedEnabled("true")).toBe(true);
    expect(isDemoFeedEnabled("TRUE")).toBe(true);
    expect(isDemoFeedEnabled(" true ")).toBe(true);
  });

  it("returns false for non-true values", () => {
    expect(isDemoFeedEnabled("1")).toBe(false);
    expect(isDemoFeedEnabled("yes")).toBe(false);
    expect(isDemoFeedEnabled("false")).toBe(false);
  });
});
