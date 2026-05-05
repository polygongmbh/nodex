import { describe, it, expect } from "vitest";
import { isSpamContent } from "./spam-filter";

describe("isSpamContent", () => {
  it("detects unambiguous adult/spam markers", () => {
    expect(isSpamContent("post tagged 🔞 here")).toBe(true);
    expect(isSpamContent("f4f anyone?")).toBe(true);
  });

  it("detects crypto-spam patterns", () => {
    expect(isSpamContent("Free bitcoin to first 100")).toBe(true);
    expect(isSpamContent("crypto giveaway, click link")).toBe(true);
    expect(isSpamContent("free btc to first 100")).toBe(true);
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

  it("does not flag everyday or foreign-language phrases", () => {
    expect(isSpamContent("Cum ești astăzi?")).toBe(false);
    expect(isSpamContent("magna cum laude")).toBe(false);
    expect(isSpamContent("Dick ist ein deutscher Vorname")).toBe(false);
    expect(isSpamContent("Subscribe to the newsletter please")).toBe(false);
    expect(isSpamContent("Casino Royale was a good film")).toBe(false);
    expect(isSpamContent("Send via Telegram or WhatsApp")).toBe(false);
    expect(isSpamContent("DM me when you have a sec")).toBe(false);
    expect(isSpamContent("Click here to read more")).toBe(false);
    expect(isSpamContent("That's a sexy API design")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isSpamContent("FREE BITCOIN")).toBe(true);
    expect(isSpamContent("Crypto Giveaway today")).toBe(true);
  });
});
