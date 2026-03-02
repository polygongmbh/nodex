import { beforeEach, describe, expect, it } from "vitest";
import { resolveCurrentUserProfile } from "./current-user-profile-cache";
import { rememberCachedKind0Profile } from "./nostr/people-from-kind0";

describe("resolveCurrentUserProfile", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to cached kind:0 metadata when live profile is missing fields", () => {
    const pubkey = "a".repeat(64);
    rememberCachedKind0Profile(pubkey, {
      name: "Alice Cached",
      displayName: "Alice",
      picture: "https://example.com/alice.png",
      nip05: "alice@example.com",
      about: "cached bio",
    });

    const resolved = resolveCurrentUserProfile(pubkey, { nip05Verified: true });
    expect(resolved.name).toBe("Alice Cached");
    expect(resolved.displayName).toBe("Alice");
    expect(resolved.picture).toBe("https://example.com/alice.png");
    expect(resolved.nip05).toBe("alice@example.com");
    expect(resolved.about).toBe("cached bio");
    expect(resolved.nip05Verified).toBe(true);
  });

  it("prefers non-empty live profile fields over cached values", () => {
    const pubkey = "b".repeat(64);
    rememberCachedKind0Profile(pubkey, {
      name: "Bob Cached",
      displayName: "Bobby",
    });

    const resolved = resolveCurrentUserProfile(pubkey, {
      name: "Bob Live",
      displayName: "Bob",
    });
    expect(resolved.name).toBe("Bob Live");
    expect(resolved.displayName).toBe("Bob");
  });
});
