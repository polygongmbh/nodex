import { describe, it, expect } from "vitest";
import { deriveChannels } from "./channels";

function post(tags: string[], pubkey?: string) {
  return { tags, author: pubkey ? { pubkey } : undefined };
}

describe("deriveChannels", () => {
  it("includes user-posted tags even when no current posts mention them", () => {
    const channels = deriveChannels([post(["frontend"])], [{ name: "newtag", relayIds: [] }]);
    expect(channels.map((c) => c.name)).toContain("newtag");
  });

  it("counts tags case-insensitively from posts", () => {
    const channels = deriveChannels([post(["Backend"])], []);
    expect(channels.map((c) => c.name)).toContain("backend");
  });

  it("attaches usage counts for ranking decisions", () => {
    const channels = deriveChannels(
      [post(["alpha", "beta"]), post(["alpha"]), post(["alpha", "beta"])],
      []
    );

    const alpha = channels.find((channel) => channel.name === "alpha");
    const beta = channels.find((channel) => channel.name === "beta");

    expect(alpha?.usageCount).toBe(3);
    expect(beta?.usageCount).toBe(2);
  });

  it("dedupes tag counts within a single post", () => {
    // The converter unions t-tags and content hashtags before producing Post.tags,
    // but a defensive dedupe protects against duplicate entries inflating counts.
    const channels = deriveChannels([post(["alpha", "ALPHA", "alpha"])], []);
    expect(channels.find((c) => c.name === "alpha")?.usageCount).toBe(1);
  });

  it("force-includes core channels with zero usage", () => {
    const channels = deriveChannels([post(["random"])], [], {
      coreChannels: new Set(["work", "ops"]),
    });

    const names = channels.map((channel) => channel.name);
    expect(names).toContain("work");
    expect(names).toContain("ops");
    expect(channels.find((channel) => channel.name === "work")?.usageCount).toBe(0);
  });

  it("populates personalScore from personalize scores map", () => {
    const channels = deriveChannels([post(["a"]), post(["b"])], [], {
      personalizeScores: new Map([["a", 3]]),
    });
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
      { userPubkey: "me" }
    );
    const byName = new Map(channels.map((c) => [c.name, c]));
    expect(byName.get("a")?.userPostCount).toBe(2);
    expect(byName.get("b")?.userPostCount).toBeUndefined();
  });

  it("ignores authorless posts when counting user-authored posts", () => {
    const channels = deriveChannels([post(["a"]), post(["a"], "me")], [], { userPubkey: "me" });
    expect(channels.find((c) => c.name === "a")?.userPostCount).toBe(1);
  });
});
