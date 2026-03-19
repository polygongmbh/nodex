import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import {
  extractNostrContentReferences,
  extractNostrReferenceTagsFromContent,
} from "./content-references";

describe("content references", () => {
  it("extracts references from NIP-27 nostr URIs and bare NIP-19 tokens", () => {
    const pubkey = "a".repeat(64);
    const eventId = "b".repeat(64);
    const profile = nip19.nprofileEncode({ pubkey, relays: ["wss://relay.example"] });
    const npub = nip19.npubEncode(pubkey);
    const note = nip19.noteEncode(eventId);

    const refs = extractNostrContentReferences(
      `nostr:${profile} and ${npub} and ${note}`
    );

    expect(refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "profile", pubkey }),
        expect.objectContaining({ type: "event", eventId }),
      ])
    );
  });

  it("builds unique p/e/a tags from parsed references", () => {
    const pubkey = "a".repeat(64);
    const eventId = "b".repeat(64);
    const naddr = nip19.naddrEncode({
      kind: 30023,
      pubkey,
      identifier: "demo",
      relays: ["wss://relay.example"],
    });
    const npub = nip19.npubEncode(pubkey);
    const note = nip19.noteEncode(eventId);

    const tags = extractNostrReferenceTagsFromContent(
      `nostr:${naddr} ${npub} ${npub} ${note}`
    );

    expect(tags).toEqual(
      expect.arrayContaining([
        ["a", "30023:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:demo"],
        ["p", pubkey],
        ["e", eventId],
      ])
    );
    expect(tags.filter((tag) => tag[0] === "p")).toHaveLength(1);
  });
});
