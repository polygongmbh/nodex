import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import { defaultKind0Cache, saveCachedKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import { isProfileNameTaken } from "./profile-name-uniqueness";

const RELAY_URL = "wss://demo.test";

function seedProfile(pubkey: string, name: string): void {
  saveCachedKind0Events(
    [
      {
        id: "",
        pubkey,
        kind: NostrEventKind.Metadata,
        tags: [],
        sig: "",
        created_at: 123,
        content: JSON.stringify({ name }),
      },
    ],
    RELAY_URL,
  );
}

describe("isProfileNameTaken", () => {
  beforeEach(() => {
    defaultKind0Cache.clear();
    window.localStorage.clear();
  });

  it("returns true when candidate matches a cached profile name", () => {
    seedProfile("a".repeat(64), "alice");

    expect(isProfileNameTaken("alice")).toBe(true);
    expect(isProfileNameTaken("ALICE")).toBe(true);
  });

  it("ignores current user pubkey when checking taken names", () => {
    const pubkey = "b".repeat(64);
    seedProfile(pubkey, "bob");

    expect(isProfileNameTaken("bob", { currentPubkey: pubkey })).toBe(false);
  });

  it("includes additional known names", () => {
    expect(
      isProfileNameTaken("carol", {
        additionalKnownNames: ["alice", "carol", "dave"],
      })
    ).toBe(true);
  });
});
