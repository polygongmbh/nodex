import { beforeEach, describe, expect, it } from "vitest";
import { NostrEventKind } from "@/lib/nostr/types";
import { isProfileNameTaken } from "./profile-name-uniqueness";

describe("isProfileNameTaken", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns true when candidate matches a cached profile name", () => {
    const pubkey = "a".repeat(64);
    window.localStorage.setItem(
      "nodex.kind0.cache:local",
      JSON.stringify([
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 123,
          content: JSON.stringify({ name: "alice" }),
        },
      ])
    );

    expect(isProfileNameTaken("alice")).toBe(true);
    expect(isProfileNameTaken("ALICE")).toBe(true);
  });

  it("ignores current user pubkey when checking taken names", () => {
    const pubkey = "b".repeat(64);
    window.localStorage.setItem(
      "nodex.kind0.cache:local",
      JSON.stringify([
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 123,
          content: JSON.stringify({ name: "bob" }),
        },
      ])
    );

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
