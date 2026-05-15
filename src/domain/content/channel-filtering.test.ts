import { describe, expect, it } from "vitest";
import type { Channel } from "@/types";
import {
  fuzzyChannelTagMatch,
  getIncludedExcludedChannelNames,
  taskMatchesChannelFilters,
} from "./channel-filtering";

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

  describe("fuzzy suffix tolerance", () => {
    it("matches when the tag has up to two extra trailing characters", () => {
      expect(fuzzyChannelTagMatch("persona", "personas")).toBe(true);
      expect(fuzzyChannelTagMatch("sleep", "sleeper")).toBe(true);
    });

    it("matches when the filter has up to two extra trailing characters", () => {
      expect(fuzzyChannelTagMatch("personas", "persona")).toBe(true);
      expect(fuzzyChannelTagMatch("sleeper", "sleep")).toBe(true);
    });

    it("rejects pairs with no prefix relationship", () => {
      expect(fuzzyChannelTagMatch("cat", "cab")).toBe(false);
      expect(fuzzyChannelTagMatch("sleep", "steep")).toBe(false);
    });

    it("rejects pairs that differ by more than two trailing characters", () => {
      expect(fuzzyChannelTagMatch("persona", "personally")).toBe(false);
      expect(fuzzyChannelTagMatch("run", "running")).toBe(false);
    });

    it("includes tasks whose tag fuzzy-matches an included channel filter", () => {
      expect(taskMatchesChannelFilters(["personas"], ["persona"], [], "or")).toBe(true);
      expect(taskMatchesChannelFilters(["sleep"], ["sleeper"], [], "and")).toBe(true);
    });

    it("excludes tasks whose tag fuzzy-matches an excluded channel filter", () => {
      expect(taskMatchesChannelFilters(["personas"], [], ["persona"], "or")).toBe(false);
      expect(taskMatchesChannelFilters(["sleep"], [], ["sleeper"], "and")).toBe(false);
    });
  });
});
