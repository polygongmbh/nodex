/**
 * Vanity Nostr key mining (NIP-19 npub prefix).
 *
 * Pure, React-free helpers shared by the mining Web Worker and unit tests.
 * Given a desired prefix we brute-force secret keys until the resulting npub's
 * data part (the characters right after the "npub1" separator) starts with it.
 */
import { generateSecretKey, getPublicKey } from "nostr-tools";

/** bech32 charset (NIP-19). Notably excludes b, i, o and 1. */
export const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** Longest vanity prefix we mine for — keeps brute-force time bounded (~32^3 tries). */
export const MAX_VANITY_PREFIX = 3;

/** Safety cap; finding a 3-char prefix needs ~32768 tries on average, never this many. */
const DEFAULT_MAX_ATTEMPTS = 2_000_000;

export interface VanityKeyResult {
  secretKeyHex: string;
  pubkeyHex: string;
  attempts: number;
}

/**
 * Derive the vanity target from a typed username: drop an optional `@host`
 * suffix, lowercase, strip every character that cannot appear in an npub, and
 * keep the first {@link MAX_VANITY_PREFIX} characters.
 */
export function vanityTargetFromUsername(username: string): string {
  const localPart = username.split("@")[0].toLowerCase();
  let target = "";
  for (const char of localPart) {
    if (BECH32_CHARSET.includes(char)) {
      target += char;
      if (target.length >= MAX_VANITY_PREFIX) break;
    }
  }
  return target;
}

/**
 * The first `length` bech32 data characters of an npub, computed directly from
 * the hex pubkey's leading bytes — equivalent to `nip19.npubEncode(pubkey).slice(5)`
 * but without the full bech32 + checksum pass, so it stays cheap in the hot loop.
 * Only the first two bytes are needed for up to three characters (15 bits).
 */
export function npubPrefixFromPubkey(pubkeyHex: string, length: number): string {
  const b0 = parseInt(pubkeyHex.slice(0, 2), 16);
  const b1 = parseInt(pubkeyHex.slice(2, 4), 16);
  const words = [b0 >> 3, ((b0 & 0b111) << 2) | (b1 >> 6), (b1 >> 1) & 0b11111];
  let prefix = "";
  for (let i = 0; i < length && i < words.length; i++) {
    prefix += BECH32_CHARSET[words[i]];
  }
  return prefix;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Brute-force a secret key whose npub starts with `target`. Returns null if the
 * target is empty or the (very generous) attempt cap is exhausted.
 */
export function mineVanityKey(
  target: string,
  options: { maxAttempts?: number } = {}
): VanityKeyResult | null {
  if (!target) return null;
  const { maxAttempts = DEFAULT_MAX_ATTEMPTS } = options;
  const length = target.length;
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const secretKey = generateSecretKey();
    const pubkeyHex = getPublicKey(secretKey);
    if (npubPrefixFromPubkey(pubkeyHex, length) === target) {
      return { secretKeyHex: bytesToHex(secretKey), pubkeyHex, attempts };
    }
  }
  return null;
}
