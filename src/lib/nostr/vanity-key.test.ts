import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import {
  mineVanityKey,
  npubPrefixFromPubkey,
  vanityTargetFromUsername,
} from "./vanity-key";

describe("vanityTargetFromUsername", () => {
  it("drops npub-illegal characters and keeps the first three", () => {
    // 'i' is not in the bech32 charset, so alice -> a, l, c
    expect(vanityTargetFromUsername("alice")).toBe("alc");
  });

  it("ignores the @host suffix and lowercases", () => {
    expect(vanityTargetFromUsername("ALICE@example.com")).toBe("alc");
  });

  it("skips separators and out-of-charset digits", () => {
    expect(vanityTargetFromUsername("x_y-z9")).toBe("xyz");
  });

  it("returns empty when nothing maps to the npub charset", () => {
    // b, o, i are all excluded from bech32
    expect(vanityTargetFromUsername("boi")).toBe("");
  });
});

describe("npubPrefixFromPubkey", () => {
  it("matches the canonical nip19 npub prefix", () => {
    for (let i = 0; i < 25; i++) {
      const pubkeyHex = getPublicKey(generateSecretKey());
      const canonical = nip19.npubEncode(pubkeyHex).slice("npub1".length, "npub1".length + 3);
      expect(npubPrefixFromPubkey(pubkeyHex, 3)).toBe(canonical);
    }
  });
});

describe("mineVanityKey", () => {
  it("returns null for an empty target", () => {
    expect(mineVanityKey("")).toBeNull();
  });

  it("mines a key whose npub starts with the target", () => {
    const result = mineVanityKey("q", { maxAttempts: 100_000 });
    expect(result).not.toBeNull();
    const npub = nip19.npubEncode(result!.pubkeyHex);
    expect(npub.startsWith("npub1q")).toBe(true);
    expect(result!.secretKeyHex).toMatch(/^[0-9a-f]{64}$/);
    // the reported pubkey is the one derived from the mined secret key
    const secretBytes = Uint8Array.from(
      result!.secretKeyHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
    );
    expect(getPublicKey(secretBytes)).toBe(result!.pubkeyHex);
  });
});
