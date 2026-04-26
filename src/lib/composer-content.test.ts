import { describe, expect, it } from "vitest";
import {
  hasComposerSubstance,
  hasMeaningfulComposerText,
  hasNip99Content,
} from "./composer-content";

describe("hasMeaningfulComposerText", () => {
  it("returns false for empty string", () => {
    expect(hasMeaningfulComposerText("")).toBe(false);
  });

  it("returns false for whitespace only", () => {
    expect(hasMeaningfulComposerText("   \n\t  ")).toBe(false);
  });

  it("returns false for hashtags only", () => {
    expect(hasMeaningfulComposerText("#general")).toBe(false);
    expect(hasMeaningfulComposerText("#general #work")).toBe(false);
    expect(hasMeaningfulComposerText("  #general  ")).toBe(false);
  });

  it("returns false for mentions only", () => {
    expect(hasMeaningfulComposerText("@alice")).toBe(false);
    expect(hasMeaningfulComposerText("@alice @bob")).toBe(false);
  });

  it("returns false for hashtags and mentions with no other text", () => {
    expect(hasMeaningfulComposerText("#general @alice")).toBe(false);
  });

  it("returns true for plain text", () => {
    expect(hasMeaningfulComposerText("hello")).toBe(true);
  });

  it("returns true for text with hashtags", () => {
    expect(hasMeaningfulComposerText("hello #general")).toBe(true);
  });

  it("returns true for text with mentions", () => {
    expect(hasMeaningfulComposerText("hi @alice")).toBe(true);
  });

  it("returns true for unicode letters", () => {
    expect(hasMeaningfulComposerText("héllo")).toBe(true);
    expect(hasMeaningfulComposerText("こんにちは")).toBe(true);
  });
});

describe("hasNip99Content", () => {
  it("returns false for null/undefined/empty", () => {
    expect(hasNip99Content(null)).toBe(false);
    expect(hasNip99Content(undefined)).toBe(false);
    expect(hasNip99Content({})).toBe(false);
  });

  it("ignores whitespace-only fields", () => {
    expect(hasNip99Content({ title: "   ", summary: "" })).toBe(false);
  });

  it("returns true when any user-entered field has content", () => {
    expect(hasNip99Content({ title: "Need designer" })).toBe(true);
    expect(hasNip99Content({ summary: "details" })).toBe(true);
    expect(hasNip99Content({ price: "10", currency: "EUR" })).toBe(true);
  });
});

describe("hasComposerSubstance", () => {
  it("returns false when nothing meaningful is present", () => {
    expect(hasComposerSubstance({})).toBe(false);
    expect(hasComposerSubstance({ content: "" })).toBe(false);
    expect(hasComposerSubstance({ content: "#tag @alice" })).toBe(false);
    expect(hasComposerSubstance({ attachments: [] })).toBe(false);
    expect(hasComposerSubstance({ nip99: {} })).toBe(false);
  });

  it("returns true when text content is meaningful", () => {
    expect(hasComposerSubstance({ content: "hello world" })).toBe(true);
  });

  it("returns true when an uploaded attachment is present", () => {
    expect(
      hasComposerSubstance({
        attachments: [{ url: "https://cdn.example.com/file.png" }],
      })
    ).toBe(true);
  });

  it("ignores attachments without a url", () => {
    expect(hasComposerSubstance({ attachments: [{ url: "" }] })).toBe(false);
  });

  it("returns true when NIP-99 metadata has user content", () => {
    expect(hasComposerSubstance({ nip99: { title: "Listing" } })).toBe(true);
  });

  it("does not treat ambient state alone as substance", () => {
    // Auxiliary state like a seeded due date, priority, channel filters, or
    // location must not be enough to keep a draft alive — that is exactly the
    // leakage path between calendar/feed composers we are guarding against.
    expect(hasComposerSubstance({ content: "  " })).toBe(false);
  });
});
