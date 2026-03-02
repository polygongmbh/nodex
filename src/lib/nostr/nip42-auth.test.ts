import { describe, it, expect, vi, beforeEach } from "vitest";
import NDK, { NDKPrivateKeySigner, NDKEvent } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "./types";
import {
  generateNIP42Challenge,
  createNIP42Response,
  verifyNIP42Response,
  extractChallengeFromAuthMessage,
} from "./nip42-auth";

describe("NIP-42 Authentication", () => {
  let signer: NDKPrivateKeySigner;
  let testPubkey: string;

  beforeEach(async () => {
    // Create a test signer for each test
    signer = NDKPrivateKeySigner.generate();
    testPubkey = (await signer.user()).pubkey;
  });

  describe("generateNIP42Challenge", () => {
    it("generates a random challenge string", () => {
      const challenge1 = generateNIP42Challenge();
      const challenge2 = generateNIP42Challenge();
      
      expect(challenge1.challenge).not.toBe(challenge2.challenge);
      expect(challenge1.challenge).toMatch(/^[a-f0-9]{32}$/);
    });

    it("includes relay URL when provided", () => {
      const relayUrl = "wss://relay.example.com";
      const challenge = generateNIP42Challenge(relayUrl);
      
      expect(challenge.relay_url).toBe(relayUrl);
    });
  });

  describe("createNIP42Response", () => {
    it("creates a signed authentication event", async () => {
      const challenge = "test-challenge-123";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge);
      
      expect(responseEvent.kind).toBe(NostrEventKind.Auth);
      expect(responseEvent.content).toBe("");
      expect(responseEvent.tags).toContainEqual(["challenge", challenge]);
    });

    it("includes relay tag when provided", async () => {
      const challenge = "test-challenge-456";
      const relayUrl = "wss://relay.example.com";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge, relayUrl);
      
      const relayTag = responseEvent.tags.find(tag => tag[0] === "relay");
      expect(relayTag).toBeDefined();
      expect(relayTag?.[1]).toBe(relayUrl);
      expect(responseEvent.tags).toContainEqual(["challenge", challenge]);
    });

    it("throws error when signer has no NDK instance", async () => {
      const mockSigner = {
        ndk: undefined,
      } as unknown as NDKPrivateKeySigner;

      await expect(
        createNIP42Response(null, mockSigner, "test-challenge")
      ).rejects.toThrow("NDK instance not available");
    });
  });

  describe("verifyNIP42Response", () => {
    it("verifies a valid authentication response", async () => {
      const challenge = "test-challenge-789";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge);
      
      const isValid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey);
      
      expect(isValid).toBe(true);
    });

    it("rejects invalid challenge", async () => {
      const challenge = "test-challenge-123";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, "different-challenge");
      
      const isValid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey);
      
      expect(isValid).toBe(false);
    });

    it("rejects wrong public key", async () => {
      const challenge = "test-challenge-456";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge);
      const wrongPubkey = "0000000000000000000000000000000000000000000000000000000000000000";
      
      const isValid = await verifyNIP42Response(ndk, challenge, responseEvent, wrongPubkey);
      
      expect(isValid).toBe(false);
    });

    it("rejects wrong event kind", async () => {
      const challenge = "test-challenge-789";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge);
      responseEvent.kind = NostrEventKind.TextNote; // Wrong kind
      
      const isValid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey);
      
      expect(isValid).toBe(false);
    });

    it("rejects invalid signature", async () => {
      const challenge = "test-challenge-999";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge);
      responseEvent.sig = "invalid-signature"; // Corrupt the signature
      
      const isValid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey);
      
      expect(isValid).toBe(false);
    });

    it("rejects when challenge tag is missing", async () => {
      const challenge = "test-challenge-000";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge);
      responseEvent.tags = responseEvent.tags.filter((tag) => tag[0] !== "challenge");
      await responseEvent.sign(signer);

      const isValid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey);

      expect(isValid).toBe(false);
    });

    it("verifies expected relay tag when required", async () => {
      const challenge = "test-challenge-111";
      const relayUrl = "wss://relay.example.com";
      const ndk = new NDK({ explicitRelayUrls: [] });
      ndk.signer = signer;
      const responseEvent = await createNIP42Response(ndk, signer, challenge, relayUrl);

      const valid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey, relayUrl);
      const invalid = await verifyNIP42Response(ndk, challenge, responseEvent, testPubkey, "wss://other.relay");

      expect(valid).toBe(true);
      expect(invalid).toBe(false);
    });
  });

  describe("extractChallengeFromAuthMessage", () => {
    it("extracts challenge from AUTH message", () => {
      const message = "AUTH challenge-string-123";
      const challenge = extractChallengeFromAuthMessage(message);
      
      expect(challenge).toBe("challenge-string-123");
    });

    it("returns null for non-AUTH messages", () => {
      const message = "EVENT some-event-data";
      const challenge = extractChallengeFromAuthMessage(message);
      
      expect(challenge).toBeNull();
    });

    it("returns null for malformed AUTH messages", () => {
      const message = "AUTH";
      const challenge = extractChallengeFromAuthMessage(message);
      
      expect(challenge).toBeNull();
    });
  });
});
