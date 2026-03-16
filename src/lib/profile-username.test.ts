import { describe, expect, it } from "vitest";
import { sanitizeProfileUsername } from "./profile-username";

describe("sanitizeProfileUsername", () => {
  it("normalizes umlauts and spaces while preserving underscores", () => {
    expect(sanitizeProfileUsername("Jörg Müller_test")).toBe("jorg-muller_test");
  });

  it("keeps supported dots, dashes, and underscores while removing unsupported characters", () => {
    expect(sanitizeProfileUsername(" Alice-Example_test!?# ")).toBe("alice-example_test");
  });

  it("preserves existing dash and underscore runs", () => {
    expect(sanitizeProfileUsername("__A---B__")).toBe("__a---b__");
  });

  it("returns an empty string when nothing valid remains", () => {
    expect(sanitizeProfileUsername("!!!")).toBe("");
  });
});
