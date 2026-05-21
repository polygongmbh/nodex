import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { SelectablePerson } from "@/types/person";
import {
  derivePeopleFromKind0Events,
  getKind0CacheVersion,
  loadCachedKind0Events,
  loadCachedKind0EventsForRelayUrls,
  loadLoggedInIdentityPriority,
  rememberLoggedInIdentity,
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
import { useSeenPubkeys } from "@/features/feed-page/stores/seen-pubkeys-store";

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
  people: SelectablePerson[];
  setPeople: Dispatch<SetStateAction<SelectablePerson[]>>;
  cachedKind0Events: NostrEvent[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  removeCachedRelayProfile: (relayUrl: string) => void;
}

function arePeopleListsEqual(previous: SelectablePerson[], next: SelectablePerson[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((person, index) => {
    const candidate = next[index];
    return (
      person.pubkey === candidate.pubkey &&
      person.name === candidate.name &&
      person.displayName === candidate.displayName &&
      person.nip05 === candidate.nip05 &&
      person.about === candidate.about &&
      person.avatar === candidate.avatar &&
      person.isSelected === candidate.isSelected
    );
  });
}

export function useKind0People(
  selectedRelayUrls: string[],
  user: NostrUserLike | null,
): UseKind0PeopleResult {
  const seenPubkeys = useSeenPubkeys();
  const normalizedSelectedRelayUrls = useMemo(
    () => normalizeRelayUrlScope(selectedRelayUrls),
    [selectedRelayUrls]
  );
  const selectedRelayScopeKey = normalizedSelectedRelayUrls.join("|");
  const [people, setPeople] = useState<SelectablePerson[]>([]);
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());

  // The cache's version counter is monotone — it bumps whenever the cache
  // changes — so we re-derive scope-filtered events on every change. The
  // downstream arePeopleListsEqual check below collapses people-list
  // identity churn when the derived shape didn't actually change.
  const kind0CacheVersion = useSyncExternalStore(
    subscribeToKind0Cache,
    getKind0CacheVersion,
    getKind0CacheVersion,
  );
  const cachedKind0Events = useMemo(
    () => loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind0CacheVersion, selectedRelayScopeKey],
  );
  const fallbackKind0Events = useMemo(
    () => loadCachedKind0Events(),
    [kind0CacheVersion],
  );

  // Subscribed instead of derived from nostrEvents: kind 30315 ingests through
  // the subscription dispatcher into the presence-status module's in-memory
  // map. The version counter is what useSyncExternalStore re-reads on; the
  // map identity itself is stable.
  useSyncExternalStore(subscribeToPresenceChanges, getPresenceMapVersion, getPresenceMapVersion);
  const latestPresenceByAuthor = getLatestPresenceByAuthor();

  useEffect(() => {
    if (!user?.pubkey) return;
    setLoggedInIdentityPriority(rememberLoggedInIdentity(user.pubkey));
  }, [user?.pubkey]);

  const visiblePubkeys = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...seenPubkeys,
            ...cachedKind0Events.map((event) => event.pubkey?.trim().toLowerCase()),
          ]
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        )
      ),
    [cachedKind0Events, seenPubkeys]
  );

  useEffect(() => {
    const priorityLookup = new Map(
      loggedInIdentityPriority.map((pubkey, index) => [pubkey.toLowerCase(), index] as const)
    );
    const sortPeopleByPriority = (value: SelectablePerson[]): SelectablePerson[] =>
      [...value].sort((a, b) => {
        const aPriority = priorityLookup.get(a.pubkey.toLowerCase());
        const bPriority = priorityLookup.get(b.pubkey.toLowerCase());
        if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
        if (aPriority !== undefined) return -1;
        if (bPriority !== undefined) return 1;
        return a.displayName.localeCompare(b.displayName);
      });

    setPeople((prev) => {
      let next = derivePeopleFromKind0Events(visiblePubkeys, cachedKind0Events, fallbackKind0Events, prev, {
        prioritizedPubkeys: loggedInIdentityPriority,
      });

      if (user?.pubkey && !next.some((person) => person.pubkey === user.pubkey)) {
        next = [
          ...next,
          {
            pubkey: user.pubkey,
            name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
            displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
            nip05: user.profile?.nip05?.trim().toLowerCase(),
            avatar: user.profile?.picture,
            isSelected: prev.find((person) => person.pubkey === user.pubkey)?.isSelected || false,
          },
        ];
      }

      const sortedPeople = sortPeopleByPriority(next);
      return arePeopleListsEqual(prev, sortedPeople) ? prev : sortedPeople;
    });
  }, [cachedKind0Events, fallbackKind0Events, loggedInIdentityPriority, user, visiblePubkeys]);

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
