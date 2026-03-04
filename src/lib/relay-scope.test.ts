import { describe, expect, it } from "vitest";
import { resolveChannelRelayScopeIds } from "./relay-scope";

describe("resolveChannelRelayScopeIds", () => {
  it("returns effective active relay ids when at least one feed is selected", () => {
    const result = resolveChannelRelayScopeIds(new Set(["relay-a"]), ["demo", "relay-a", "relay-b"]);

    expect(result).toEqual(new Set(["relay-a"]));
  });

  it("falls back to all available relay ids when no feeds are selected", () => {
    const result = resolveChannelRelayScopeIds(new Set(), ["demo", "relay-a", "relay-b"]);

    expect(result).toEqual(new Set(["demo", "relay-a", "relay-b"]));
  });
});
