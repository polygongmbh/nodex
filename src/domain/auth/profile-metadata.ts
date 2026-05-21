import type { NostrEvent } from "@/lib/nostr/types";

interface ProfileSnapshot {
  name?: string;
  displayName?: string;
}

interface CurrentUserLike {
  pubkey?: string;
  profile?: ProfileSnapshot;
}

export function hasUsableProfileFields(profile?: ProfileSnapshot | null): boolean {
  return Boolean(profile?.name?.trim() && profile?.displayName?.trim());
}

export function hasCurrentUserProfileMetadata(
  user: CurrentUserLike | null | undefined,
  cachedKind0Events: NostrEvent[]
): boolean {
  if (!user?.pubkey) return true;
  if (hasUsableProfileFields(user.profile)) return true;

  const normalizedPubkey = user.pubkey.trim().toLowerCase();
  return cachedKind0Events.some((event) => {
    const eventPubkey =
      typeof event.pubkey === "string" ? event.pubkey.trim().toLowerCase() : "";
    return eventPubkey === normalizedPubkey && Boolean(event.content?.trim());
  });
}
