import { describe, expect, it } from "vitest";
import {
  buildReactionTags,
  extractReactionTargetId,
  extractReactionTargetPubkey,
  isReactionEvent,
  normalizeReactionContent,
} from "./reaction-events";
import { NostrEventKind } from "@/lib/nostr/types";

describe("reaction-events", () => {
  describe("isReactionEvent", () => {
    it("returns true only for kind 7", () => {
      expect(isReactionEvent(7)).toBe(true);
      expect(isReactionEvent(1)).toBe(false);
      expect(isReactionEvent(NostrEventKind.Task)).toBe(false);
    });
  });

  describe("buildReactionTags", () => {
    it("emits e, p, k tags for a regular event", () => {
      const tags = buildReactionTags({
        id: "abc",
        kind: NostrEventKind.TextNote,
        pubkey: "pk1",
        tags: [],
      });
      expect(tags).toEqual([
        ["e", "abc", "", "pk1"],
        ["p", "pk1"],
        ["k", "1"],
      ]);
    });

    it("adds an a tag for parameterized replaceable kinds", () => {
      const tags = buildReactionTags({
        id: "xid",
        kind: NostrEventKind.ClassifiedListing,
        pubkey: "pk2",
        tags: [["d", "my-d-tag"]],
      });
      expect(tags).toContainEqual(["a", "30402:pk2:my-d-tag"]);
    });

    it("does not add an a tag for unparameterized replaceable kinds (e.g. metadata)", () => {
      const tags = buildReactionTags({
        id: "mid",
        kind: NostrEventKind.Metadata,
        pubkey: "pk3",
        tags: [],
      });
      expect(tags.some((t) => t[0] === "a")).toBe(false);
    });

    it("omits the a tag for parameterized kinds missing a d tag", () => {
      const tags = buildReactionTags({
        id: "lid",
        kind: NostrEventKind.ClassifiedListing,
        pubkey: "pk4",
        tags: [],
      });
      expect(tags.some((t) => t[0] === "a")).toBe(false);
    });
  });

  describe("extractReactionTargetId / Pubkey", () => {
    it("returns the last e tag id and p tag pubkey", () => {
      const tags = [
        ["e", "first", "", "fpk"],
        ["p", "fpk"],
        ["e", "second", "", "spk"],
        ["p", "spk"],
        ["k", "1"],
      ];
      expect(extractReactionTargetId(tags)).toBe("second");
      expect(extractReactionTargetPubkey(tags)).toBe("spk");
    });

    it("returns undefined when missing", () => {
      expect(extractReactionTargetId([])).toBeUndefined();
      expect(extractReactionTargetPubkey([])).toBeUndefined();
    });
  });

  describe("normalizeReactionContent", () => {
    it("treats empty and + as 👍", () => {
      expect(normalizeReactionContent("")).toBe("👍");
      expect(normalizeReactionContent("+")).toBe("👍");
      expect(normalizeReactionContent("  +  ")).toBe("👍");
    });

    it("treats - as 👎", () => {
      expect(normalizeReactionContent("-")).toBe("👎");
    });

    it("accepts single emoji", () => {
      expect(normalizeReactionContent("❤️")).toBe("❤️");
      expect(normalizeReactionContent("🎉")).toBe("🎉");
      expect(normalizeReactionContent("🚀")).toBe("🚀");
    });

    it("rejects shortcodes and arbitrary text", () => {
      expect(normalizeReactionContent(":heart:")).toBeUndefined();
      expect(normalizeReactionContent("nice")).toBeUndefined();
      expect(normalizeReactionContent("👍👎")).toBeUndefined();
    });
  });
});
