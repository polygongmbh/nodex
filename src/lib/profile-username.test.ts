import { describe, expect, it } from "vitest";
import { sanitizeProfileUsername } from "./profile-username";

describe("sanitizeProfileUsername", () => {
  it("normalizes umlauts, spaces, and underscores for usernames", () => {
    expect(sanitizeProfileUsername("Jörg Müller_test")).toBe("jorg-muller-test");
  });

  it("keeps supported dots while removing unsupported characters", () => {
    expect(sanitizeProfileUsername(" Alice.Example!?# ")).toBe("alice.example");
  });

  it("collapses repeated separators and trims leading punctuation", () => {
    expect(sanitizeProfileUsername(" __A   B__ ")).toBe("a-b");
  });

  it("returns an empty string when nothing valid remains", () => {
    expect(sanitizeProfileUsername("!!!")).toBe("");
  });
});
