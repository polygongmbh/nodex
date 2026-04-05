import { describe, expect, it } from "vitest";
import { nip19 } from "@nostr-dev-kit/ndk";
import {
  formatAuthorMetaLabel,
  formatAuthorMetaParts,
  getCompactPersonLabel,
  getPersonDisplayName,
} from "./person";

describe("person helpers", () => {
  it("includes display name, username, and abbreviated pubkey", () => {
    const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const label = formatAuthorMetaLabel({
      id: pubkey,
      displayName: "Alice Doe",
      name: "alice",
      nip05: "alice@example.com",
    });

    expect(label).toContain("Alice Doe");
    expect(label).toContain("@alice");
    expect(label).toContain("alice@example.com");
    expect(label).toContain("npub1");
  });

  it("includes display name with abbreviated pubkey when username is not distinct", () => {
    const pubkey = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    const label = formatAuthorMetaLabel({
      id: pubkey,
      displayName: "alice",
      name: "alice",
    });

    expect(label).toContain("alice (npub");
    expect(label).not.toContain("@alice");
  });

  it("shows full pubkey when no display name and username are available", () => {
    const pubkey = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    const label = formatAuthorMetaLabel({
      id: pubkey,
      displayName: "",
      name: "",
    });

    expect(label).toBe(pubkey);
  });

  it("shows full pubkey when display and username are pubkey-derived placeholders", () => {
    const pubkey = "e752d82f04fb53a2e328ea9fb23a6d7ea52b8ba6f833de31e48d95107e8cb9f2";
    const label = formatAuthorMetaLabel({
      id: pubkey,
      displayName: "e752d82f...b9f2",
      name: "e752d82f",
    });

    expect(label).toBe(nip19.npubEncode(pubkey));
  });

  it("returns structured parts so secondary metadata can be styled separately", () => {
    const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const parts = formatAuthorMetaParts({
      id: pubkey,
      displayName: "Alice Doe",
      name: "alice",
      nip05: "alice@example.com",
    });

    expect(parts.primary).toBe("Alice Doe");
    expect(parts.secondary).toContain("@alice");
    expect(parts.secondary).toContain("alice@example.com");
    expect(parts.secondary).toContain("npub1");
  });

  it("uses nip05 as the primary label when no human display name or username are available", () => {
    const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const label = formatAuthorMetaLabel({
      id: pubkey,
      displayName: "",
      name: "",
      nip05: "alice@example.com",
    });

    expect(label).toContain("alice@example.com");
    expect(label).toContain("npub1");
  });

  it("prefers display name over username for compact person labels", () => {
    expect(
      getCompactPersonLabel({
        id: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        displayName: "Alice Doe",
        name: "alice",
      })
    ).toBe("Alice Doe");
  });

  it("falls back to username when no display name is available", () => {
    expect(
      getPersonDisplayName({
        id: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        displayName: "",
        name: "alice",
      })
    ).toBe("alice");
  });

  it("abbreviates pubkey-derived placeholders for compact person labels", () => {
    const pubkey = "e752d82f04fb53a2e328ea9fb23a6d7ea52b8ba6f833de31e48d95107e8cb9f2";

    expect(
      getCompactPersonLabel({
        id: pubkey,
        displayName: pubkey,
        name: pubkey,
      })
    ).toBe(nip19.npubEncode(pubkey).replace(/^(.{10}).+(.{6})$/, "$1…$2"));
  });
});
