import { describe, it, expect } from "vitest";
import { bandChannelsByActivity } from "./channel-banding";
import { Channel } from "@/types";

function channel(partial: Partial<Channel> & { name: string }): Channel {
  return {
    id: partial.name,
    name: partial.name,
    filterState: partial.filterState ?? "neutral",
    usageCount: partial.usageCount,
    pinIndex: partial.pinIndex,
    personalScore: partial.personalScore,
    userPostCount: partial.userPostCount,
  };
}

const noneCore = () => false;

describe("bandChannelsByActivity", () => {
  it("returns empty bands for empty input", () => {
    expect(bandChannelsByActivity([], noneCore)).toEqual({ primary: [], expanded: [] });
  });

  it("treats evenly-active channels as all primary", () => {
    const channels = [
      channel({ name: "a", usageCount: 2 }),
      channel({ name: "b", usageCount: 2 }),
      channel({ name: "c", usageCount: 2 }),
    ];
    const { primary, expanded } = bandChannelsByActivity(channels, noneCore);
    expect(primary.map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(expanded.map((c) => c.name)).toEqual(["a", "b", "c"]);
  });

  it("splits skewed activity by normalized score", () => {
    const channels = [
      channel({ name: "hot", usageCount: 30 }),
      channel({ name: "warm", usageCount: 10 }),
      channel({ name: "cold", usageCount: 4 }),
      channel({ name: "icy", usageCount: 1 }),
    ];
    const { primary, expanded } = bandChannelsByActivity(channels, noneCore, {
      primaryPct: 0.5,
      expandedPct: 0.3,
      primaryFloor: 0,
    });
    expect(primary.map((c) => c.name)).toEqual(["hot", "warm"]);
    expect(expanded.map((c) => c.name)).toEqual(["hot", "warm", "cold"]);
    expect(expanded.find((c) => c.name === "icy")).toBeUndefined();
  });

  it("force-includes core channels even with zero score", () => {
    const channels = [
      channel({ name: "hot", usageCount: 100 }),
      channel({ name: "mycore", usageCount: 0 }),
    ];
    const isCore = (name: string) => name === "mycore";
    const { primary, expanded } = bandChannelsByActivity(channels, isCore);
    expect(primary.map((c) => c.name)).toContain("mycore");
    expect(expanded.map((c) => c.name)).toContain("mycore");
  });

  it("force-includes pinned and non-neutral channels", () => {
    const channels = [
      channel({ name: "hot", usageCount: 100 }),
      channel({ name: "pinned-low", usageCount: 1, pinIndex: 0 }),
      channel({ name: "selected-low", usageCount: 1, filterState: "included" }),
    ];
    const { primary } = bandChannelsByActivity(channels, noneCore);
    expect(primary.map((c) => c.name).sort()).toEqual(
      ["hot", "pinned-low", "selected-low"].sort()
    );
  });

  it("backfills primary up to primaryFloor from highest-scored expanded", () => {
    const channels = [
      channel({ name: "a", usageCount: 5 }),
      channel({ name: "b", usageCount: 4 }),
      channel({ name: "c", usageCount: 3 }),
    ];
    const { primary } = bandChannelsByActivity(channels, noneCore, {
      primaryPct: 0.99,
      expandedPct: 0,
      primaryFloor: 2,
    });
    expect(primary.length).toBeGreaterThanOrEqual(2);
    expect(primary[0].name).toBe("a");
  });

  it("handles maxRawScore === 0 by returning only forced items in primary", () => {
    const channels = [
      channel({ name: "core1", usageCount: 0 }),
      channel({ name: "other", usageCount: 0 }),
    ];
    const isCore = (name: string) => name === "core1";
    const { primary, expanded } = bandChannelsByActivity(channels, isCore, {
      primaryFloor: 0,
    });
    expect(primary.map((c) => c.name)).toEqual(["core1"]);
    expect(expanded.map((c) => c.name)).toEqual(["core1"]);
  });

  it("personal frecency boosts a channel into primary", () => {
    const channels = [
      channel({ name: "hot", usageCount: 50 }),
      channel({ name: "personal", usageCount: 2, personalScore: 10 }),
      channel({ name: "noise", usageCount: 2 }),
    ];
    const { primary } = bandChannelsByActivity(channels, noneCore, {
      primaryPct: 0.5,
      expandedPct: 0.15,
      primaryFloor: 0,
    });
    expect(primary.map((c) => c.name)).toContain("personal");
    expect(primary.map((c) => c.name)).not.toContain("noise");
  });

  it("ranks a heavily user-posted channel above a less-involved but busier channel", () => {
    // Reproduces the reported bug: a channel with dozens of your own posts
    // should outrank a channel with comparable raw count but no involvement.
    const channels = [
      channel({ name: "yours", usageCount: 30, userPostCount: 25 }),
      channel({ name: "busy", usageCount: 40 }),
    ];
    const { primary } = bandChannelsByActivity(channels, noneCore, {
      primaryPct: 0.95,
      expandedPct: 0.5,
      primaryFloor: 1,
    });
    expect(primary[0].name).toBe("yours");
  });

  it("preserves input order within each band", () => {
    const channels = [
      channel({ name: "z", usageCount: 30 }),
      channel({ name: "y", usageCount: 30 }),
      channel({ name: "x", usageCount: 30 }),
    ];
    const { primary, expanded } = bandChannelsByActivity(channels, noneCore);
    expect(primary.map((c) => c.name)).toEqual(["z", "y", "x"]);
    expect(expanded.map((c) => c.name)).toEqual(["z", "y", "x"]);
  });
});
