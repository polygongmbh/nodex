import { describe, it, expect } from "vitest";
import { deriveChannels } from "./channels";

function post(tags: string[], pubkey?: string) {
  return { tags, author: pubkey ? { pubkey } : undefined };
}

describe("deriveChannels", () => {
  it("includes newly posted tags even below frequency threshold", () => {
    const channels = deriveChannels([post(["frontend"])], [{ name: "newtag", relayIds: [] }], 6);
    expect(channels.map((c) => c.name)).toContain("newtag");
  });

  it("counts tags case-insensitively from posts", () => {
    const channels = deriveChannels([post(["Backend"])], [], 1);
    expect(channels.map((c) => c.name)).toContain("backend");
  });

  it("attaches usage counts for ranking decisions", () => {
    const channels = deriveChannels(
      [post(["alpha", "beta"]), post(["alpha"]), post(["alpha", "beta"])],
      [],
      1
    );

    const alpha = channels.find((channel) => channel.name === "alpha");
    const beta = channels.find((channel) => channel.name === "beta");

    expect(alpha?.usageCount).toBe(3);
    expect(beta?.usageCount).toBe(2);
  });

  it("dedupes tag counts within a single post", () => {
    // The converter unions t-tags and content hashtags before producing Post.tags,
    // but a defensive dedupe protects against duplicate entries inflating counts.
    const channels = deriveChannels([post(["alpha", "ALPHA", "alpha"])], [], 1);
    expect(channels.find((c) => c.name === "alpha")?.usageCount).toBe(1);
  });

  it("prioritizes personalized channels with dampened frecency", () => {
    const channels = deriveChannels(
      [post(["alpha"]), post(["alpha"]), post(["beta"])],
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
      [post(["alpha"]), post(["beta"]), post(["gamma"])],
      [],
      { minCount: 1, maxCount: 2 }
    );

    expect(channels).toHaveLength(2);
  });

  it("sorts visible channels alphabetically after score-based selection", () => {
    const channels = deriveChannels(
      [post(["zeta"]), post(["zeta"]), post(["alpha"]), post(["beta"])],
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

  it("force-includes core channels with zero usage", () => {
    const channels = deriveChannels(
      [post(["random"])],
      [],
      {
        minCount: 6,
        coreChannels: new Set(["work", "ops"]),
      }
    );

    const names = channels.map((channel) => channel.name);
    expect(names).toContain("work");
    expect(names).toContain("ops");
    expect(channels.find((channel) => channel.name === "work")?.usageCount).toBe(0);
  });

  it("populates personalScore from personalize scores map", () => {
    const channels = deriveChannels(
      [post(["a"]), post(["b"])],
      [],
      {
        minCount: 1,
        personalizeScores: new Map([["a", 3]]),
      }
    );
    const byName = new Map(channels.map((c) => [c.name, c]));
    expect(byName.get("a")?.personalScore).toBe(3);
    expect(byName.get("b")?.personalScore).toBeUndefined();
  });

  it("counts user-authored posts per channel via userPubkey", () => {
    const channels = deriveChannels(
      [
        post(["a"], "me"),
        post(["a"], "me"),
        post(["a"], "other"),
        post(["b"], "other"),
      ],
      [],
      { minCount: 1, userPubkey: "me" }
    );
    const byName = new Map(channels.map((c) => [c.name, c]));
    expect(byName.get("a")?.userPostCount).toBe(2);
    expect(byName.get("b")?.userPostCount).toBeUndefined();
  });

  it("ignores authorless posts when counting user-authored posts", () => {
    const channels = deriveChannels(
      [post(["a"]), post(["a"], "me")],
      [],
      { minCount: 1, userPubkey: "me" }
    );
    expect(channels.find((c) => c.name === "a")?.userPostCount).toBe(1);
  });
});
