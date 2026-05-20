import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { SelectablePerson } from "@/types/person";
import { NostrEventKind } from "@/lib/nostr/types";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import {
  derivePeopleFromKind0Events,
  loadCachedKind0Events,
  loadCachedKind0EventsForRelayUrls,
  loadLoggedInIdentityPriority,
  rememberCachedKind0Profile,
  rememberLoggedInIdentity,
  removeCachedKind0EventsByRelayUrl,
  subscribeToKind0Cache,
  type Kind0LikeEvent,
} from "@/infrastructure/nostr/people-from-kind0";
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
  people: SelectablePerson[];
  setPeople: Dispatch<SetStateAction<SelectablePerson[]>>;
  cachedKind0Events: Kind0LikeEvent[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  supplementalLatestActivityByAuthor: Map<string, number>;
  removeCachedRelayProfile: (relayUrl: string) => void;
}

function areKind0EventListsEqual(previous: Kind0LikeEvent[], next: Kind0LikeEvent[]): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    const a = previous[index];
    const b = next[index];
    if (a.pubkey !== b.pubkey || a.created_at !== b.created_at || a.content !== b.content || a.kind !== b.kind) {
      return false;
    }
  }
  return true;
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
  nostrEvents: CachedNostrEvent[],
  selectedRelayUrls: string[],
  user: NostrUserLike | null,
): UseKind0PeopleResult {
  const normalizedSelectedRelayUrls = useMemo(
    () => normalizeRelayUrlScope(selectedRelayUrls),
    [selectedRelayUrls]
  );
  const selectedRelayScopeKey = normalizedSelectedRelayUrls.join("|");
  const [people, setPeople] = useState<SelectablePerson[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState<Kind0LikeEvent[]>(() =>
    loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls)
  );
  const [fallbackKind0Events, setFallbackKind0Events] = useState<Kind0LikeEvent[]>(() => loadCachedKind0Events());
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());

  useEffect(() => {
    const reload = () => {
      const nextScoped = loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls);
      setCachedKind0Events((previous) =>
        areKind0EventListsEqual(previous, nextScoped) ? previous : nextScoped
      );
      const nextFallback = loadCachedKind0Events();
      setFallbackKind0Events((previous) =>
        areKind0EventListsEqual(previous, nextFallback) ? previous : nextFallback
      );
    };
    reload();
    return subscribeToKind0Cache(reload);
    // Equivalent normalized relay scopes should not trigger another cache refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRelayScopeKey]);

  // Subscribed instead of derived from nostrEvents: kind 30315 ingests through
  // the subscription dispatcher into the presence-status module's in-memory
  // map. The version counter is what useSyncExternalStore re-reads on; the
  // map identity itself is stable.
  useSyncExternalStore(subscribeToPresenceChanges, getPresenceMapVersion, getPresenceMapVersion);
  const latestPresenceByAuthor = getLatestPresenceByAuthor();

  const supplementalLatestActivityByAuthor = useMemo(() => {
    const latestActivePresenceByAuthor = new Map<string, number>();
    for (const [authorId, snapshot] of latestPresenceByAuthor.entries()) {
      if (snapshot.state === "active") {
        latestActivePresenceByAuthor.set(authorId, snapshot.reportedAtMs);
      }
    }
    const latestByAuthor = new Map<string, number>();

    for (const event of nostrEvents) {
      if (event.kind === NostrEventKind.Metadata || event.kind === NostrEventKind.UserStatus) continue;

      const authorId = event.pubkey?.trim().toLowerCase();
      if (!authorId) continue;

      const timestampMs = (event.created_at || 0) * 1000;
      const previous = latestByAuthor.get(authorId) ?? Number.NEGATIVE_INFINITY;
      if (timestampMs > previous) {
        latestByAuthor.set(authorId, timestampMs);
      }
    }

    for (const [authorId, presenceTimestampMs] of latestActivePresenceByAuthor.entries()) {
      const previous = latestByAuthor.get(authorId) ?? Number.NEGATIVE_INFINITY;
      if (presenceTimestampMs > previous) {
        latestByAuthor.set(authorId, presenceTimestampMs);
      }
    }

    return latestByAuthor;
  }, [latestPresenceByAuthor, nostrEvents]);

  useEffect(() => {
    if (!user?.pubkey) return;
    setLoggedInIdentityPriority(rememberLoggedInIdentity(user.pubkey));
  }, [user?.pubkey]);

  const profileCachePayload = useMemo(() => {
    if (!user?.pubkey || !user?.profile) return null;
    return {
      pubkey: user.pubkey,
      profile: {
        name: user.profile.name,
        displayName: user.profile.displayName,
        about: user.profile.about,
        picture: user.profile.picture,
        nip05: user.profile.nip05,
      },
    };
  }, [user?.profile, user?.pubkey]);

  useEffect(() => {
    if (!profileCachePayload) return;
    // rememberCachedKind0Profile notifies kind 0 subscribers internally when
    // its write changes the cache; the per-relay save is now driven by the
    // subscription dispatcher (ingestKind0Event).
    rememberCachedKind0Profile(profileCachePayload.pubkey, profileCachePayload.profile);
  }, [profileCachePayload]);

  const visiblePubkeys = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...nostrEvents.map((event) => event.pubkey?.trim().toLowerCase()),
            ...cachedKind0Events.map((event) => event.pubkey?.trim().toLowerCase()),
          ]
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        )
      ),
    [cachedKind0Events, nostrEvents]
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
    supplementalLatestActivityByAuthor,
    removeCachedRelayProfile,
  };
}
