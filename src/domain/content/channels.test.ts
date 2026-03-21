import { describe, it, expect } from "vitest";
import { deriveChannels } from "./channels";

describe("deriveChannels", () => {
  it("includes newly posted tags even below frequency threshold", () => {
    const channels = deriveChannels([{ tags: ["frontend"] }], [], [{ name: "newtag", relayIds: [] }], 6);
    expect(channels.map((c) => c.name)).toContain("newtag");
  });

  it("counts T tags case-insensitively from nostr events", () => {
    const channels = deriveChannels([], [{ tags: [["T", "Backend"]], content: "" }], [], 1);
    expect(channels.map((c) => c.name)).toContain("backend");
  });

  it("attaches usage counts for ranking decisions", () => {
    const channels = deriveChannels(
      [{ tags: ["alpha", "alpha", "beta"] }],
      [{ tags: [["t", "alpha"]], content: "#beta" }],
      [],
      1
    );

    const alpha = channels.find((channel) => channel.name === "alpha");
    const beta = channels.find((channel) => channel.name === "beta");

    expect(alpha?.usageCount).toBe(3);
    expect(beta?.usageCount).toBe(2);
  });

  it("prioritizes personalized channels with dampened frecency", () => {
    const channels = deriveChannels(
      [{ tags: ["alpha", "alpha", "beta"] }],
      [{ tags: [["t", "beta"]], content: "" }],
      [],
      {
        minCount: 1,
        personalizeScores: new Map([
          ["beta", 8],
          ["alpha", 1],
        ]),
      }
    );

    expect(channels[0]?.name).toBe("beta");
  });

  it("caps initial channel list when maxCount is provided", () => {
    const channels = deriveChannels(
      [{ tags: ["alpha", "beta", "gamma"] }],
      [],
      [],
      { minCount: 1, maxCount: 2 }
    );

    expect(channels).toHaveLength(2);
  });

  it("sorts visible channels alphabetically after score-based selection", () => {
    const channels = deriveChannels(
      [{ tags: ["zeta", "zeta", "alpha", "beta"] }],
      [],
      [],
      {
        minCount: 1,
        maxCount: 2,
        sortVisibleAlphabetically: true,
      }
    );

    expect(channels.map((channel) => channel.name)).toEqual(["alpha", "zeta"]);
    expect(channels.find((channel) => channel.name === "zeta")?.usageCount).toBe(2);
  });

  it("does not parse hashtags embedded inside words", () => {
    const channels = deriveChannels(
      [],
      [{ tags: [], content: "email#ops #release" }],
      [],
      1
    );

    expect(channels.map((channel) => channel.name)).toEqual(["release"]);
  });
});
