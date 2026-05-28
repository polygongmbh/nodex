import { describe, expect, it } from "vitest";
import { isHexColorToken } from "./content-tokens";

describe("isHexColorToken", () => {
  it("accepts uppercase hex of length 3/4/6/8 with at least one A-F", () => {
    expect(isHexColorToken("FEE")).toBe(true);
    expect(isHexColorToken("ABD")).toBe(true);
    expect(isHexColorToken("FE0F")).toBe(true);
    expect(isHexColorToken("123FEF")).toBe(true);
    expect(isHexColorToken("A1B2C3D4")).toBe(true);
  });

  it("rejects any lowercase letter (so lowercase tags survive)", () => {
    expect(isHexColorToken("fee")).toBe(false);
    expect(isHexColorToken("Fee")).toBe(false);
    expect(isHexColorToken("abc123")).toBe(false);
    expect(isHexColorToken("FFAACc")).toBe(false);
  });

  it("rejects pure digits (preserves numeric tags like #1, #123)", () => {
    expect(isHexColorToken("1")).toBe(false);
    expect(isHexColorToken("123")).toBe(false);
    expect(isHexColorToken("1234")).toBe(false);
    expect(isHexColorToken("123456")).toBe(false);
  });

  it("rejects non-hex letters and invalid lengths", () => {
    expect(isHexColorToken("GHI")).toBe(false);
    expect(isHexColorToken("ABCDE")).toBe(false); // length 5
    expect(isHexColorToken("AB")).toBe(false); // length 2
    expect(isHexColorToken("FFAA00CC11")).toBe(false); // length 10
  });
});
