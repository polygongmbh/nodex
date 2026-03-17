import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Person } from "@/types";
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
  saveCachedKind0Events,
  type Kind0LikeEvent,
} from "@/infrastructure/nostr/people-from-kind0";
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
  cachedKind0Events: Kind0LikeEvent[];
  supplementalLatestActivityByAuthor: Map<string, number>;
  seedCachedKind0Events: (events: Kind0LikeEvent[]) => void;
  removeCachedRelayProfile: (relayUrl: string) => void;
}

export function useKind0People(
  nostrEvents: CachedNostrEvent[],
  selectedRelayUrls: string[],
  user: NostrUserLike | null
): UseKind0PeopleResult {
  const [people, setPeople] = useState<Person[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState<Kind0LikeEvent[]>(() =>
    loadCachedKind0EventsForRelayUrls(selectedRelayUrls)
  );
  const [fallbackKind0Events, setFallbackKind0Events] = useState<Kind0LikeEvent[]>(() => loadCachedKind0Events());
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());
  const [cacheRevision, setCacheRevision] = useState(0);

  const liveKind0Events = useMemo(
    () =>
      nostrEvents
        .filter((event) => event.kind === NostrEventKind.Metadata)
        .map((event) => ({
          kind: event.kind,
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: event.content || "",
          relayUrls: [
            ...(event.relayUrls || []),
            ...(event.relayUrl ? [event.relayUrl] : []),
          ]
            .map((relayUrl) => relayUrl.trim().replace(/\/+$/, ""))
            .filter(Boolean),
        })),
    [nostrEvents]
  );

  useEffect(() => {
    setCachedKind0Events(loadCachedKind0EventsForRelayUrls(selectedRelayUrls));
    setFallbackKind0Events(loadCachedKind0Events());
  }, [cacheRevision, selectedRelayUrls]);

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
    const eventsByRelayUrl = new Map<string, Kind0LikeEvent[]>();
    liveKind0Events.forEach((event) => {
      event.relayUrls.forEach((relayUrl) => {
        const previous = eventsByRelayUrl.get(relayUrl) || [];
        eventsByRelayUrl.set(relayUrl, [
          ...previous,
          {
            kind: event.kind,
            pubkey: event.pubkey,
            created_at: event.created_at,
            content: event.content,
          },
        ]);
      });
    });

    if (eventsByRelayUrl.size === 0) return;

    eventsByRelayUrl.forEach((events, relayUrl) => {
      const existing = loadCachedKind0Events(relayUrl);
      saveCachedKind0Events([...existing, ...events], relayUrl);
    });
    setCacheRevision((previous) => previous + 1);
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
    rememberCachedKind0Profile(
      profileCachePayload.pubkey,
      {
        name: profileCachePayload.profile.name,
        displayName: profileCachePayload.profile.displayName,
        about: profileCachePayload.profile.about,
        picture: profileCachePayload.profile.picture,
        nip05: profileCachePayload.profile.nip05,
      }
    );
    setCacheRevision((previous) => previous + 1);
  }, [profileCachePayload]);

  const visiblePubkeys = useMemo(
    () =>
      Array.from(
        new Set(
          nostrEvents
            .map((event) => event.pubkey?.trim().toLowerCase())
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        )
      ),
    [nostrEvents]
  );

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
      let next = derivePeopleFromKind0Events(visiblePubkeys, cachedKind0Events, fallbackKind0Events, prev, {
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
  }, [cachedKind0Events, fallbackKind0Events, loggedInIdentityPriority, user, visiblePubkeys]);

  const seedCachedKind0Events = useCallback(
    (events: Kind0LikeEvent[]) => {
      const existing = loadCachedKind0Events();
      saveCachedKind0Events([...existing, ...events]);
      setCacheRevision((previous) => previous + 1);
    },
    []
  );

  const removeCachedRelayProfile = useCallback((relayUrl: string) => {
    removeCachedKind0EventsByRelayUrl(relayUrl);
    setCacheRevision((previous) => previous + 1);
  }, []);

  return {
    people,
    setPeople,
    cachedKind0Events,
    supplementalLatestActivityByAuthor,
    seedCachedKind0Events,
    removeCachedRelayProfile,
  };
}
