import { describe, expect, it } from "vitest";
import type { Channel } from "@/types";
import { getIncludedExcludedChannelNames, taskMatchesChannelFilters } from "./channel-filtering";

describe("channel filtering helpers", () => {
  it("extracts included and excluded channels with lowercase normalization", () => {
    const channels: Channel[] = [
      { id: "a", name: "General", filterState: "included" },
      { id: "b", name: "Blocked", filterState: "excluded" },
      { id: "c", name: "Ignore", filterState: "neutral" },
    ];

    expect(getIncludedExcludedChannelNames(channels)).toEqual({
      included: ["general"],
      excluded: ["blocked"],
    });
  });

  it("passes when no included or excluded channels are active", () => {
    expect(taskMatchesChannelFilters(["general"], [], [], "and")).toBe(true);
    expect(taskMatchesChannelFilters(["general"], [], [], "or")).toBe(true);
  });

  it("rejects tasks containing excluded channels", () => {
    expect(taskMatchesChannelFilters(["general", "blocked"], ["general"], ["blocked"], "or")).toBe(false);
  });

  it("requires all included channels in and mode", () => {
    expect(taskMatchesChannelFilters(["general"], ["general", "release"], [], "and")).toBe(false);
    expect(taskMatchesChannelFilters(["general", "release"], ["general", "release"], [], "and")).toBe(true);
  });

  it("requires at least one included channel in or mode", () => {
    expect(taskMatchesChannelFilters(["ops"], ["general", "release"], [], "or")).toBe(false);
    expect(taskMatchesChannelFilters(["release"], ["general", "release"], [], "or")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(taskMatchesChannelFilters(["General", "Release"], ["general"], [], "and")).toBe(true);
  });
});
