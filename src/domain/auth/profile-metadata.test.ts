import { describe, expect, it } from "vitest";
import { hasCurrentUserProfileMetadata } from "./profile-metadata";
import { NostrEventKind } from "@/lib/nostr/types";
import type { NDKUser } from "@/infrastructure/nostr/ndk-context";

describe("hasCurrentUserProfileMetadata", () => {
  it("treats a signed-in guest with local name and displayName as already having profile metadata", () => {
    const guestUser: Partial<NDKUser> = {
      pubkey: "a".repeat(64),
      npub: "npub1guest",
      profile: {
        name: "guest-user",
        displayName: "Guest User",
      },
    };

    expect(hasCurrentUserProfileMetadata(guestUser as NDKUser, [])).toBe(true);
  });

  it("keeps requiring metadata when the current user lacks required local profile fields and cache", () => {
    const guestUser: Partial<NDKUser> = {
      pubkey: "b".repeat(64),
      npub: "npub1incomplete",
      profile: {
        displayName: "Only Display Name",
      },
    };

    expect(hasCurrentUserProfileMetadata(guestUser as NDKUser, [])).toBe(false);
  });

  it("still treats cached kind-0 metadata as sufficient when local profile fields are absent", () => {
    const pubkey = "c".repeat(64);
    const guestUser: Partial<NDKUser> = {
      pubkey,
      npub: "npub1cached",
      profile: {},
    };

    expect(
      hasCurrentUserProfileMetadata(guestUser as NDKUser, [
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 1,
          content: JSON.stringify({ name: "cached", displayName: "Cached User" }),
        },
      ])
    ).toBe(true);
  });
});
