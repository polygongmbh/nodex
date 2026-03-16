import { describe, expect, it } from "vitest";
import { hasMeaningfulComposerText } from "./composer-content";

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
