import { adjectives, colors, uniqueNamesGenerator } from "unique-names-generator";

const NIP05_LOCAL_PART_PATTERN = /[^a-z0-9._-]+/g;

function toNip05CompatibleLocalPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(NIP05_LOCAL_PART_PATTERN, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildDeterministicGuestName(pubkey: string): string {
  const normalizedPubkey = pubkey.trim().toLowerCase();
  const generated = uniqueNamesGenerator({
    dictionaries: [adjectives, colors],
    separator: "_",
    length: 2,
    style: "lowerCase",
    seed: normalizedPubkey || "guest",
  });
  const suffix = toNip05CompatibleLocalPart(generated);
  if (suffix) return `guest_${suffix}`;
  const fallback = normalizedPubkey.slice(0, 8) || "anon";
  return `guest_${fallback}`;
}
