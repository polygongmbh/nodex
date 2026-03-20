import { describe, expect, it } from "vitest";
import { nip19 } from "@nostr-dev-kit/ndk";
import type { Person } from "@/types";
import {
  extractMentionIdentifiersFromContent,
  formatMentionIdentifierForDisplay,
  getPreferredMentionIdentifier,
  personMatchesMentionQuery,
  resolveMentionedPubkeys,
  resolveMentionedPubkeysAsync,
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
    expect(getPreferredMentionIdentifier(bob)).toBe(nip19.npubEncode("b".repeat(64)));
  });

  it("matches mention query against aliases", () => {
    expect(personMatchesMentionQuery(alice, "alice@")).toBe(true);
    expect(personMatchesMentionQuery(alice, "example.com")).toBe(true);
    expect(personMatchesMentionQuery(bob, "alice")).toBe(false);
  });

  it("resolves mentioned pubkeys from nip05, username, or pubkey mentions", () => {
    const pubkeyMention = "c".repeat(64);
    const npubMention = nip19.npubEncode("d".repeat(64));
    const resolved = resolveMentionedPubkeys(
      `@alice@example.com @bob @${pubkeyMention} @${npubMention}`,
      [alice, bob]
    );
    expect(resolved).toEqual([pubkeyMention, "d".repeat(64), "a".repeat(64), "b".repeat(64)]);
  });

  it("resolves unresolved NIP-05 mentions via async lookup", async () => {
    const resolved = await resolveMentionedPubkeysAsync(
      "@carol@example.com @bob",
      [bob],
      {
        resolveNip05: async (identifier) =>
          identifier === "carol@example.com" ? nip19.npubEncode("c".repeat(64)) : null,
      }
    );

    expect(resolved).toEqual(["b".repeat(64), "c".repeat(64)]);
  });

  it("truncates pubkey-like identifiers for compact display", () => {
    const hex = "f".repeat(64);
    const npub = nip19.npubEncode(hex);
    const formattedFromHex = formatMentionIdentifierForDisplay(hex);
    const formattedFromNpub = formatMentionIdentifierForDisplay(npub);

    expect(formattedFromHex.startsWith("npub1")).toBe(true);
    expect(formattedFromHex).toContain("…");
    expect(formattedFromNpub).toBe(formattedFromHex);
    expect(formatMentionIdentifierForDisplay("alice@example.com")).toBe("alice@example.com");
  });
});
