import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { getPersonDisplayName, type Person } from "@/types/person";
import {
  derivePeopleFromKind0Events,
  getKind0CacheVersion,
  loadCachedKind0Events,
  loadCachedKind0EventsForRelayUrls,
  removeCachedKind0EventsByRelayUrl,
  subscribeToKind0Cache,
} from "@/infrastructure/nostr/people-from-kind0";
import type { NostrEvent } from "@/lib/nostr/types";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import {
  getLatestPresenceByAuthor,
  getPresenceMapVersion,
  subscribeToPresenceChanges,
  type LatestPresenceSnapshot,
} from "@/lib/presence-status";

interface UserProfileSnapshot {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

interface NostrUserLike {
  pubkey?: string;
  npub: string;
  profile?: UserProfileSnapshot;
}

interface UseKind0PeopleResult {
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  cachedKind0Events: NostrEvent[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  removeCachedRelayProfile: (relayUrl: string) => void;
}

function arePeopleListsEqual(previous: Person[], next: Person[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((person, index) => {
    const candidate = next[index];
    return (
      person.pubkey === candidate.pubkey &&
      person.name === candidate.name &&
      person.displayName === candidate.displayName &&
      person.nip05 === candidate.nip05 &&
      person.about === candidate.about &&
      person.picture === candidate.picture
    );
  });
}

export function useKind0People(
  selectedRelayUrls: string[],
  user: NostrUserLike | null,
): UseKind0PeopleResult {
  const normalizedSelectedRelayUrls = useMemo(
    () => normalizeRelayUrlScope(selectedRelayUrls),
    [selectedRelayUrls]
  );
  const selectedRelayScopeKey = normalizedSelectedRelayUrls.join("|");
  const [people, setPeople] = useState<Person[]>([]);

  // The cache's version counter is monotone — it bumps whenever the cache
  // changes — so we re-derive scope-filtered events on every change. The
  // downstream arePeopleListsEqual check below collapses people-list
  // identity churn when the derived shape didn't actually change.
  const kind0CacheVersion = useSyncExternalStore(
    subscribeToKind0Cache,
    getKind0CacheVersion,
    getKind0CacheVersion,
  );
  // No active scope means "All spaces" (the shared empty-scope rule), so resolve
  // profiles across every cached relay bucket. Here "all" is loadAll rather than
  // loadForRelayUrls(everyUrl) because the cache also retains buckets for relays
  // no longer in the selectable set. Without this fallback,
  // loadCachedKind0EventsForRelayUrls([]) returns nothing and the People sidebar
  // collapses to empty whenever no space is selected, even though the feed and
  // channel list still show everything.
  const cachedKind0Events = useMemo(
    () =>
      normalizedSelectedRelayUrls.length > 0
        ? loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls)
        : loadCachedKind0Events(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind0CacheVersion, selectedRelayScopeKey],
  );
  const fallbackKind0Events = useMemo(
    () => loadCachedKind0Events(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind0CacheVersion],
  );

  // Subscribed instead of derived from nostrEvents: kind 30315 ingests through
  // the subscription dispatcher into the presence-status module's in-memory
  // map. The version counter is what useSyncExternalStore re-reads on; the
  // map identity itself is stable.
  useSyncExternalStore(subscribeToPresenceChanges, getPresenceMapVersion, getPresenceMapVersion);
  const latestPresenceByAuthor = getLatestPresenceByAuthor();

  const visiblePubkeys = useMemo(
    () =>
      Array.from(
        new Set(
          cachedKind0Events
            .map((event) => event.pubkey?.trim().toLowerCase())
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        )
      ),
    [cachedKind0Events]
  );

  useEffect(() => {
    setPeople((prev) => {
      let next = derivePeopleFromKind0Events(visiblePubkeys, cachedKind0Events, fallbackKind0Events);

      if (user?.pubkey && !next.some((person) => person.pubkey === user.pubkey)) {
        next = [
          ...next,
          {
            pubkey: user.pubkey,
            name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
            displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
            nip05: user.profile?.nip05?.trim().toLowerCase(),
            picture: user.profile?.picture,
          },
        ].sort((a, b) => getPersonDisplayName(a).localeCompare(getPersonDisplayName(b)));
      }

      return arePeopleListsEqual(prev, next) ? prev : next;
    });
  }, [cachedKind0Events, fallbackKind0Events, user, visiblePubkeys]);

  const removeCachedRelayProfile = useCallback((relayUrl: string) => {
    // removeCachedKind0EventsByRelayUrl notifies subscribers internally; the
    // subscribe effect above will re-read both bucket views.
    removeCachedKind0EventsByRelayUrl(relayUrl);
  }, []);

  return {
    people,
    setPeople,
    cachedKind0Events,
    latestPresenceByAuthor,
    removeCachedRelayProfile,
  };
}
