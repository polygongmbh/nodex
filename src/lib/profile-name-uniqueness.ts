import { loadCachedKind0Events } from "@/lib/people-from-kind0";
import { parseKind0Content } from "@/lib/nostr/profile-metadata";

interface ProfileNameUniquenessOptions {
  currentPubkey?: string | null;
  additionalKnownNames?: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isProfileNameTaken(
  candidateName: string,
  options: ProfileNameUniquenessOptions = {}
): boolean {
  const normalizedCandidate = normalize(candidateName);
  if (!normalizedCandidate) return false;

  const normalizedCurrentPubkey = normalize(options.currentPubkey || "");
  const knownNames = new Set<string>();

  for (const event of loadCachedKind0Events()) {
    const eventPubkey = normalize(event.pubkey || "");
    if (eventPubkey && eventPubkey === normalizedCurrentPubkey) continue;

    const parsed = parseKind0Content(event.content);
    const normalizedName = normalize(parsed.name || "");
    if (normalizedName) {
      knownNames.add(normalizedName);
    }
  }

  for (const name of options.additionalKnownNames || []) {
    const normalizedName = normalize(name);
    if (normalizedName) {
      knownNames.add(normalizedName);
    }
  }

  return knownNames.has(normalizedCandidate);
}
