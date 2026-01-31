import { describe, it, expect } from "vitest";
import {
  generateSubscriptionId,
  createUnsignedEvent,
  signEvent,
  validateEvent,
  extractMentions,
  extractReferences,
  extractHashtags,
  formatPubkey,
  formatRelativeTime,
} from "./utils";
import { NostrEvent, NostrEventKind } from "./types";

describe("nostr utils", () => {
  describe("generateSubscriptionId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateSubscriptionId();
      const id2 = generateSubscriptionId();
      expect(id1).not.toBe(id2);
    });

    it("should use prefix", () => {
      const id = generateSubscriptionId("timeline");
      expect(id.startsWith("timeline_")).toBe(true);
    });
  });

  describe("createUnsignedEvent", () => {
    it("should create an unsigned event with correct structure", () => {
      const pubkey = "a".repeat(64);
      const event = createUnsignedEvent(
        pubkey,
        NostrEventKind.TextNote,
        "Hello, world!",
        [["t", "nostr"]]
      );

      expect(event.pubkey).toBe(pubkey);
      expect(event.kind).toBe(NostrEventKind.TextNote);
      expect(event.content).toBe("Hello, world!");
      expect(event.tags).toEqual([["t", "nostr"]]);
      expect(event.created_at).toBeGreaterThan(0);
    });
  });

  describe("signEvent", () => {
    it("should add id and sig to unsigned event", () => {
      const unsigned = createUnsignedEvent(
        "a".repeat(64),
        NostrEventKind.TextNote,
        "Test"
      );

      const signed = signEvent(unsigned);

      expect(signed.id).toBeDefined();
      expect(signed.id.length).toBe(64);
      expect(signed.sig).toBeDefined();
      expect(signed.sig.length).toBe(128);
    });
  });

  describe("validateEvent", () => {
    const validEvent: NostrEvent = {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      kind: NostrEventKind.TextNote,
      tags: [],
      content: "Hello!",
      sig: "c".repeat(128),
    };

    it("should validate a correct event", () => {
      expect(validateEvent(validEvent)).toBe(true);
    });

    it("should reject event with invalid id length", () => {
      expect(validateEvent({ ...validEvent, id: "too-short" })).toBe(false);
    });

    it("should reject event with invalid pubkey", () => {
      expect(validateEvent({ ...validEvent, pubkey: "" })).toBe(false);
    });

    it("should reject event with negative timestamp", () => {
      expect(validateEvent({ ...validEvent, created_at: -1 })).toBe(false);
    });

    it("should reject event with non-array tags", () => {
      expect(validateEvent({ ...validEvent, tags: "invalid" as any })).toBe(false);
    });

    it("should reject event with invalid signature length", () => {
      expect(validateEvent({ ...validEvent, sig: "short" })).toBe(false);
    });
  });

  describe("extractMentions", () => {
    it("should extract pubkeys from p tags", () => {
      const event: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Date.now(),
        kind: NostrEventKind.TextNote,
        tags: [
          ["p", "user1pubkey"],
          ["p", "user2pubkey"],
          ["e", "someeventid"],
        ],
        content: "",
        sig: "c".repeat(128),
      };

      const mentions = extractMentions(event);
      expect(mentions).toEqual(["user1pubkey", "user2pubkey"]);
    });
  });

  describe("extractReferences", () => {
    it("should extract event IDs from e tags", () => {
      const event: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Date.now(),
        kind: NostrEventKind.TextNote,
        tags: [
          ["e", "event1id"],
          ["e", "event2id"],
          ["p", "somepubkey"],
        ],
        content: "",
        sig: "c".repeat(128),
      };

      const refs = extractReferences(event);
      expect(refs).toEqual(["event1id", "event2id"]);
    });
  });

  describe("extractHashtags", () => {
    it("should extract hashtags from t tags", () => {
      const event: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Date.now(),
        kind: NostrEventKind.TextNote,
        tags: [
          ["t", "Nostr"],
          ["t", "Bitcoin"],
        ],
        content: "",
        sig: "c".repeat(128),
      };

      const hashtags = extractHashtags(event);
      expect(hashtags).toEqual(["nostr", "bitcoin"]);
    });
  });

  describe("formatPubkey", () => {
    it("should format long pubkey with ellipsis", () => {
      const pubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const formatted = formatPubkey(pubkey);
      expect(formatted).toBe("abcdef12...34567890");
    });

    it("should return short pubkey as-is", () => {
      const pubkey = "short";
      expect(formatPubkey(pubkey)).toBe("short");
    });
  });

  describe("formatRelativeTime", () => {
    it("should format recent time as just now", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatRelativeTime(now - 30)).toBe("just now");
    });

    it("should format minutes ago", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatRelativeTime(now - 300)).toBe("5m ago");
    });

    it("should format hours ago", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatRelativeTime(now - 7200)).toBe("2h ago");
    });

    it("should format days ago", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatRelativeTime(now - 172800)).toBe("2d ago");
    });
  });
});
