// NIP-42 Authentication Challenge/Response
// https://github.com/nostr-protocol/nips/blob/master/42.md

import NDK, { NDKEvent, NDKSigner } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "./types";

/**
 * NIP-42 Authentication Challenge
 * Used to verify ownership of a private key without exposing it
 */
export interface NIP42Challenge {
  challenge: string;
  relay_url?: string;
}

/**
 * NIP-42 Authentication Response
 * Signed event proving ownership of the private key
 */
export interface NIP42Response {
  event: NDKEvent;
  signature: string;
}

/**
 * Generate a NIP-42 authentication challenge
 * @param relayUrl Optional relay URL for the challenge
 * @returns Random challenge string
 */
export function generateNIP42Challenge(relayUrl?: string): NIP42Challenge {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const challenge = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    challenge,
    relay_url: relayUrl,
  };
}

/**
 * Create a NIP-42 authentication response by signing the challenge
 * @param ndk NDK instance
 * @param signer NDK signer instance
 * @param challenge Challenge string from the server
 * @param relayUrl Optional relay URL
 * @returns Signed authentication event
 */
export async function createNIP42Response(
  ndk: NDK,
  signer: NDKSigner,
  challenge: string,
  relayUrl?: string
): Promise<NDKEvent> {
  if (!ndk || !signer) {
    throw new Error("NDK instance not available");
  }

  const authEvent = new NDKEvent(ndk);
  authEvent.kind = NostrEventKind.Auth; // NIP-42 uses kind 22242
  authEvent.content = "";
  authEvent.tags = [["challenge", challenge]];

  if (relayUrl) {
    authEvent.tags.push(["relay", relayUrl]);
  }

  await authEvent.sign(signer);
  return authEvent;
}

/**
 * Verify a NIP-42 authentication response
 * @param ndk NDK instance for verification
 * @param challenge Original challenge string
 * @param responseEvent Signed authentication event
 * @param expectedPubkey Expected public key
 * @returns True if verification succeeds
 */
export async function verifyNIP42Response(
  _ndk: NDK,
  challenge: string,
  responseEvent: NDKEvent,
  expectedPubkey: string,
  expectedRelayUrl?: string
): Promise<boolean> {
  // Verify event structure
  if (responseEvent.kind !== NostrEventKind.Auth) {
    return false;
  }

  // NIP-42 auth responses should not carry challenge in content.
  if (responseEvent.content !== "") {
    return false;
  }

  // Verify public key matches expected
  if (responseEvent.pubkey !== expectedPubkey) {
    return false;
  }

  const challengeTag = responseEvent.tags.find((tag) => tag[0] === "challenge");
  if (!challengeTag || challengeTag[1] !== challenge) {
    return false;
  }

  if (expectedRelayUrl) {
    const relayTag = responseEvent.tags.find((tag) => tag[0] === "relay");
    if (!relayTag || relayTag[1] !== expectedRelayUrl) {
      return false;
    }
  }

  return responseEvent.verifySignature(false) === true;
}

/**
 * Extract challenge from AUTH message
 * @param message AUTH message from relay
 * @returns Challenge string or null
 */
export function extractChallengeFromAuthMessage(message: string): string | null {
  if (!message.startsWith("AUTH")) {
    return null;
  }

  const parts = message.split(" ");
  if (parts.length < 2) {
    return null;
  }

  return parts[1];
}
