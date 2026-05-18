import { useMemo } from "react";
import type { Post } from "@/types";
import type { SelectablePerson } from "@/types/person";
import {
  derivePeopleFromKind0Events,
  type Kind0LikeEvent,
} from "@/infrastructure/nostr/people-from-kind0";

interface UseMentionAutocompletePeopleOptions {
  /** Posts visible in the current relay scope; their authors join the autocomplete set. */
  scopedPosts: Pick<Post, "author">[];
  /** All known kind:0 profile events (resolved labels, NIP-05, etc). */
  cachedKind0Events: Kind0LikeEvent[];
  /** People manifest passed through unchanged for label resolution. */
  people: SelectablePerson[];
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
  people,
}: UseMentionAutocompletePeopleOptions): SelectablePerson[] {
  return useMemo(() => {
    const visiblePubkeys = Array.from(
      new Set(
        [
          ...scopedPosts.map((post) => post.author?.pubkey?.trim().toLowerCase()),
          ...cachedKind0Events.map((event) => event.pubkey?.trim().toLowerCase()),
        ].filter((pubkey): pubkey is string => Boolean(pubkey)),
      ),
    );
    if (visiblePubkeys.length === 0) return [];
    return derivePeopleFromKind0Events(
      visiblePubkeys,
      cachedKind0Events,
      cachedKind0Events,
      people,
    );
  }, [cachedKind0Events, people, scopedPosts]);
}
