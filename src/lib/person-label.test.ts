import { describe, expect, it } from "vitest";
import { formatAuthorMetaLabel } from "./person-label";

describe("formatAuthorMetaLabel", () => {
  it("includes display name, username, and shortened pubkey", () => {
    const label = formatAuthorMetaLabel({
      personId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      displayName: "Alice Doe",
      username: "alice",
    });

    expect(label).toContain("Alice Doe");
    expect(label).toContain("@alice");
    expect(label).toMatch(/0123…cdef#[a-z0-9]{4}/i);
  });

  it("falls back when username is the same as display name", () => {
    const label = formatAuthorMetaLabel({
      personId: "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      displayName: "alice",
      username: "alice",
    });

    expect(label).toContain("alice");
    expect(label).not.toContain("@alice");
    expect(label).toMatch(/npub…qqqq#[a-z0-9]{4}/i);
  });
});
