import { NDKUser, nip19 } from "@nostr-dev-kit/ndk";

const HEX_PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;
const NPUB_PATTERN = /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/i;

const npubCache = new Map<string, string>();
const hexCache = new Map<string, string>();

interface PubkeyDisplayOptions {
  prefix?: number;
  suffix?: number;
  ellipsis?: string;
}

export function isHexPubkey(value: string): boolean {
  return HEX_PUBKEY_PATTERN.test(value.trim());
}

export function isNpub(value: string): boolean {
  return NPUB_PATTERN.test(value.trim());
}

export function hexPubkeyToNpub(pubkey: string): string | null {
  const normalized = pubkey.trim().toLowerCase();
  if (!isHexPubkey(normalized)) return null;

  const cached = npubCache.get(normalized);
  if (cached) return cached;

  try {
    const npub = new NDKUser({ pubkey: normalized }).npub.toLowerCase();
    npubCache.set(normalized, npub);
    return npub;
  } catch {
    return null;
  }
}

export function npubToHexPubkey(npub: string): string | null {
  const normalized = npub.trim().toLowerCase();
  if (!isNpub(normalized)) return null;

  const cached = hexCache.get(normalized);
  if (cached) return cached;

  try {
    const decoded = nip19.decode(normalized);
    if (decoded.type !== "npub" || typeof decoded.data !== "string") return null;
    const hex = decoded.data.toLowerCase();
    if (!isHexPubkey(hex)) return null;
    hexCache.set(normalized, hex);
    return hex;
  } catch {
    return null;
  }
}

export function toUserFacingPubkey(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (isNpub(normalized)) return normalized;
  const npub = hexPubkeyToNpub(normalized);
  return npub || trimmed;
}

export function canonicalizePubkey(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (isHexPubkey(normalized)) return normalized;
  const hex = npubToHexPubkey(normalized);
  return hex ?? normalized;
}

export function pubkeysEqual(a: string, b: string): boolean {
  return canonicalizePubkey(a) === canonicalizePubkey(b);
}

export function formatUserFacingPubkey(
  value: string,
  options: PubkeyDisplayOptions = {}
): string {
  const userFacing = toUserFacingPubkey(value);
  const normalized = userFacing.toLowerCase();
  if (!isHexPubkey(normalized) && !isNpub(normalized)) return userFacing;

  const prefix = options.prefix ?? 10;
  const suffix = options.suffix ?? 6;
  const ellipsis = options.ellipsis ?? "…";
  if (userFacing.length <= prefix + suffix + ellipsis.length) {
    return userFacing;
  }
  return `${userFacing.slice(0, prefix)}${ellipsis}${userFacing.slice(-suffix)}`;
}
