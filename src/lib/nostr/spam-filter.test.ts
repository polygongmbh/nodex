import { describe, it, expect } from "vitest";
import { isSpamContent } from "./spam-filter";

describe("isSpamContent", () => {
  it("detects sexual content", () => {
    expect(isSpamContent("Check out my onlyfans")).toBe(true);
    expect(isSpamContent("NSFW content here")).toBe(true);
    expect(isSpamContent("Adult content 18+")).toBe(true);
  });

  it("detects spam patterns", () => {
    expect(isSpamContent("Free bitcoin giveaway")).toBe(true);
    expect(isSpamContent("DM me for details")).toBe(true);
    expect(isSpamContent("Click here now")).toBe(true);
    expect(isSpamContent("Follow me for follow back")).toBe(true);
  });

  it("does not flag normal content", () => {
    expect(isSpamContent("Working on #design today")).toBe(false);
    expect(isSpamContent("Just finished a great project")).toBe(false);
    expect(isSpamContent("Meeting at 3pm to discuss roadmap")).toBe(false);
  });

  it("matches whole words only (no false positives on substrings)", () => {
    expect(isSpamContent("document routes in the api docs")).toBe(false);
    expect(isSpamContent("Dickens novel discussion")).toBe(false);
    expect(isSpamContent("essex meeting notes")).toBe(false);
    expect(isSpamContent("scumbag detector")).toBe(false);
  });

  it("does not flag foreign-language words that overlap English keywords", () => {
    expect(isSpamContent("Cum ești astăzi?")).toBe(false);
    expect(isSpamContent("magna cum laude")).toBe(false);
    expect(isSpamContent("Dick ist ein deutscher Vorname")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isSpamContent("FREE BITCOIN")).toBe(true);
    expect(isSpamContent("OnlyFans")).toBe(true);
  });
});
