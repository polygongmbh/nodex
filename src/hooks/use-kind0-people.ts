import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Person } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { CachedNostrEvent } from "@/lib/nostr/event-cache";
import {
  derivePeopleFromKind0Events,
  loadCachedKind0Events,
  loadLoggedInIdentityPriority,
  mergeKind0EventsWithCache,
  rememberCachedKind0Profile,
  rememberLoggedInIdentity,
  saveCachedKind0Events,
} from "@/lib/nostr/people-from-kind0";
import { deriveLatestActivePresenceByAuthor } from "@/lib/presence-status";

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
  cachedKind0Events: Array<{ kind: number; pubkey: string; created_at?: number; content: string }>;
  supplementalLatestActivityByAuthor: Map<string, number>;
  seedCachedKind0Events: (events: Array<{ kind: number; pubkey: string; created_at?: number; content: string }>) => void;
}

export function useKind0People(
  nostrEvents: CachedNostrEvent[],
  user: NostrUserLike | null
): UseKind0PeopleResult {
  const [people, setPeople] = useState<Person[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState(() => loadCachedKind0Events());
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());

  const liveKind0Events = useMemo(
    () =>
      nostrEvents
        .filter((event) => event.kind === NostrEventKind.Metadata)
        .map((event) => ({
          kind: event.kind,
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: event.content || "",
        })),
    [nostrEvents]
  );

  const mergedKind0Events = useMemo(
    () => mergeKind0EventsWithCache(liveKind0Events, cachedKind0Events),
    [cachedKind0Events, liveKind0Events]
  );

  const supplementalLatestActivityByAuthor = useMemo(() => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const latestActivePresenceByAuthor = deriveLatestActivePresenceByAuthor(
      nostrEvents.filter((event) => event.kind === NostrEventKind.UserStatus),
      nowUnix
    );
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
  }, [nostrEvents]);

  useEffect(() => {
    setCachedKind0Events((previous) => {
      const merged = mergeKind0EventsWithCache(liveKind0Events, previous);
      saveCachedKind0Events(merged);
      return merged;
    });
  }, [liveKind0Events]);

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
    setCachedKind0Events((previous) =>
      rememberCachedKind0Profile(
        profileCachePayload.pubkey,
        {
          name: profileCachePayload.profile.name,
          displayName: profileCachePayload.profile.displayName,
          about: profileCachePayload.profile.about,
          picture: profileCachePayload.profile.picture,
          nip05: profileCachePayload.profile.nip05,
        },
        previous
      )
    );
  }, [profileCachePayload]);

  useEffect(() => {
    const priorityLookup = new Map(
      loggedInIdentityPriority.map((pubkey, index) => [pubkey.toLowerCase(), index] as const)
    );
    const sortPeopleByPriority = (value: Person[]): Person[] =>
      [...value].sort((a, b) => {
        const aPriority = priorityLookup.get(a.id.toLowerCase());
        const bPriority = priorityLookup.get(b.id.toLowerCase());
        if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
        if (aPriority !== undefined) return -1;
        if (bPriority !== undefined) return 1;
        return a.displayName.localeCompare(b.displayName);
      });

    setPeople((prev) => {
      let next = derivePeopleFromKind0Events(mergedKind0Events, prev, {
        prioritizedPubkeys: loggedInIdentityPriority,
      });

      if (user?.pubkey && !next.some((person) => person.id === user.pubkey)) {
        next = [
          ...next,
          {
            id: user.pubkey,
            name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
            displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
            nip05: user.profile?.nip05?.trim().toLowerCase(),
            avatar: user.profile?.picture,
            isOnline: true,
            onlineStatus: "online",
            isSelected: prev.find((person) => person.id === user.pubkey)?.isSelected || false,
          },
        ];
      }

      return sortPeopleByPriority(next);
    });
  }, [loggedInIdentityPriority, mergedKind0Events, user]);

  const seedCachedKind0Events = useCallback(
    (events: Array<{ kind: number; pubkey: string; created_at?: number; content: string }>) => {
      setCachedKind0Events((previous) => {
        const merged = mergeKind0EventsWithCache(events, previous);
        saveCachedKind0Events(merged);
        return merged;
      });
    },
    []
  );

  return {
    people,
    setPeople,
    cachedKind0Events,
    supplementalLatestActivityByAuthor,
    seedCachedKind0Events,
  };
}
