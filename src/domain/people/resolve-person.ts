import type { Person } from "@/types/person";
import { canonicalizePubkey, formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

/**
 * Synthetic Person built purely from a pubkey. The `name`/`displayName` are the
 * pubkey-derived placeholder labels the event converter used to embed on
 * `Post.author`; the display helpers recognise these via
 * `isPubkeyDerivedPlaceholder` and fall through to the npub form, so a sparse
 * author renders the same whether it came from here or from a real kind-0 miss.
 */
export function buildFallbackPersonFromPubkey(pubkey: string): Person {
  const normalized = canonicalizePubkey(pubkey);
  const label = formatUserFacingPubkey(normalized);
  return { pubkey: normalized, name: label, displayName: label };
}

/**
 * Resolve the best-known Person for an author pubkey: prefer kind-0 people
 * metadata, fall back to a pubkey-derived synthetic Person. The pubkey is
 * normalized to lowercase hex before lookup, so callers pass `post.pubkey`
 * directly without pre-normalizing.
 */
export function resolvePersonForPubkey(
  pubkey: string,
  people?: Person[] | Map<string, Person>
): Person {
  const normalized = canonicalizePubkey(pubkey);
  if (people) {
    const match =
      people instanceof Map
        ? people.get(normalized)
        : people.find((person) => canonicalizePubkey(person.pubkey) === normalized);
    if (match) return match;
  }
  return buildFallbackPersonFromPubkey(normalized);
}
