import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

const DEFAULT_HUE = 210;

function hashStringToHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // keep it a 32-bit int
  }
  return Math.abs(hash) % 360;
}

function getAuthorSeed(pubkey: string): string {
  // Seed by the npub form — the label the synthetic Task.author once carried —
  // so colors stay identical now that posts carry only a pubkey.
  return (formatUserFacingPubkey(pubkey) || pubkey || "anon").trim().toLowerCase();
}

export interface AuthorColor {
  accent: string;
  background: string;
}

export function getAuthorColor(pubkey: string): AuthorColor {
  const seed = getAuthorSeed(pubkey);
  if (!seed) {
    return {
      accent: `hsl(${DEFAULT_HUE}, 65%, 55%)`,
      background: `hsl(${DEFAULT_HUE}, 65%, 92%)`,
    };
  }
  const hue = hashStringToHue(seed);
  return {
    accent: `hsl(${hue}, 70%, 52%)`,
    background: `hsl(${hue}, 55%, 94%)`,
  };
}
