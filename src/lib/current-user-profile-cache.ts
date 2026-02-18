import { loadCachedKind0Events } from "@/lib/people-from-kind0";
import { parseKind0Content } from "@/lib/nostr/profile-metadata";

export interface ProfileWithCacheFallback {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  nip05Verified?: boolean;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveCurrentUserProfile(
  pubkey: string | null | undefined,
  profile: ProfileWithCacheFallback | null | undefined
): ProfileWithCacheFallback {
  if (!pubkey) {
    return { ...(profile || {}) };
  }

  const normalizedPubkey = pubkey.trim().toLowerCase();
  const cachedEvent = loadCachedKind0Events()
    .filter((event) => event.pubkey.toLowerCase() === normalizedPubkey)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
  const cachedProfile = cachedEvent ? parseKind0Content(cachedEvent.content) : {};

  const merged: ProfileWithCacheFallback = { ...(profile || {}) };
  merged.name = toNonEmptyString(profile?.name) || toNonEmptyString(cachedProfile.name);
  merged.displayName = toNonEmptyString(profile?.displayName) || toNonEmptyString(cachedProfile.displayName);
  merged.picture = toNonEmptyString(profile?.picture) || toNonEmptyString(cachedProfile.picture);
  merged.about = toNonEmptyString(profile?.about) || toNonEmptyString(cachedProfile.about);
  merged.nip05 = toNonEmptyString(profile?.nip05) || toNonEmptyString(cachedProfile.nip05);

  return merged;
}
