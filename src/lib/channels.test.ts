import { describe, it, expect } from "vitest";
import { deriveChannels } from "./channels";

describe("deriveChannels", () => {
  it("includes newly posted tags even below frequency threshold", () => {
    const channels = deriveChannels(
      [{ tags: ["frontend"] }],
      [],
      ["newtag"],
      6
    );

    expect(channels.map((c) => c.name)).toContain("newtag");
  });

  it("counts T tags case-insensitively from nostr events", () => {
    const channels = deriveChannels(
      [],
      [{ tags: [["T", "Backend"]], content: "" }],
      [],
      1
    );

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
});
