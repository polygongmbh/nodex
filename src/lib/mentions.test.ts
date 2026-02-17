import { describe, expect, it } from "vitest";
import type { Person } from "@/types";
import {
  extractMentionIdentifiersFromContent,
  getPreferredMentionIdentifier,
  personMatchesMentionQuery,
  resolveMentionedPubkeys,
} from "./mentions";

const alice: Person = {
  id: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  nip05: "alice@example.com",
  isOnline: true,
  isSelected: false,
};

const bob: Person = {
  id: "b".repeat(64),
  name: "bob",
  displayName: "Bob",
  isOnline: true,
  isSelected: false,
};

describe("mentions", () => {
  it("extracts unique normalized mention identifiers including NIP-05", () => {
    expect(
      extractMentionIdentifiersFromContent("Ping @Alice and @alice@example.com and @alice.")
    ).toEqual(["alice", "alice@example.com"]);
  });

  it("prefers NIP-05 identifier for mention insertion", () => {
    expect(getPreferredMentionIdentifier(alice)).toBe("alice@example.com");
    expect(getPreferredMentionIdentifier(bob)).toBe("b".repeat(64));
  });

  it("matches mention query against aliases", () => {
    expect(personMatchesMentionQuery(alice, "alice@")).toBe(true);
    expect(personMatchesMentionQuery(alice, "example.com")).toBe(true);
    expect(personMatchesMentionQuery(bob, "alice")).toBe(false);
  });

  it("resolves mentioned pubkeys from nip05, username, or pubkey mentions", () => {
    const pubkeyMention = "c".repeat(64);
    const resolved = resolveMentionedPubkeys(
      `@alice@example.com @bob @${pubkeyMention}`,
      [alice, bob]
    );
    expect(resolved).toEqual([pubkeyMention, "a".repeat(64), "b".repeat(64)]);
  });
});
