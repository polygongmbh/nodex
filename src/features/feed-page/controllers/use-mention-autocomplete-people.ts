import { useMemo } from "react";
import type { Post } from "@/types";
import type { Person } from "@/types/person";
import type { NostrEvent } from "@/lib/nostr/types";
import { derivePeopleFromKind0Events } from "@/infrastructure/nostr/people-from-kind0";

interface UseMentionAutocompletePeopleOptions {
  /** Posts visible in the current relay scope; their authors join the autocomplete set. */
  scopedPosts: Pick<Post, "pubkey">[];
  /** All known kind:0 profile events (resolved labels, NIP-05, etc). */
  cachedKind0Events: NostrEvent[];
}

/**
 * Returns the set of people the composer should offer for @-mention
 * autocomplete: everyone who has authored a post visible in the current scope,
 * plus anyone with a known kind:0 profile. Decoupled from the broader
 * timeline controller so the runtime context can subscribe to it directly.
 */
export function useMentionAutocompletePeople({
  scopedPosts,
  cachedKind0Events,
}: UseMentionAutocompletePeopleOptions): Person[] {
  return useMemo(() => {
    const visiblePubkeys = Array.from(
      new Set(
        [
          ...scopedPosts.map((post) => post.pubkey.trim().toLowerCase()),
          ...cachedKind0Events.map((event) => event.pubkey?.trim().toLowerCase()),
        ].filter((pubkey): pubkey is string => Boolean(pubkey)),
      ),
    );
    if (visiblePubkeys.length === 0) return [];
    return derivePeopleFromKind0Events(
      visiblePubkeys,
      cachedKind0Events,
      cachedKind0Events,
    );
  }, [cachedKind0Events, scopedPosts]);
}
