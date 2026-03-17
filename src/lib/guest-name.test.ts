import { describe, expect, it } from "vitest";
import { isNip05CompatibleName } from "@/infrastructure/nostr/profile-metadata";
import { buildDeterministicGuestName } from "./guest-name";

describe("buildDeterministicGuestName", () => {
  it("is deterministic for the same pubkey", () => {
    const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(buildDeterministicGuestName(pubkey)).toBe(buildDeterministicGuestName(pubkey));
  });

  it("adds a stable guest_ prefix", () => {
    const generated = buildDeterministicGuestName("a".repeat(64));
    expect(generated.startsWith("guest_")).toBe(true);
  });

  it("produces a nip05-compatible local-part", () => {
    const generated = buildDeterministicGuestName("f".repeat(64));
    expect(isNip05CompatibleName(generated)).toBe(true);
  });
});
