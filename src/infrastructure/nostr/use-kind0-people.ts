import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Person } from "@/types/person";
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
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";
import {
  deriveLatestPresenceByAuthor,
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
  cachedKind0Events: Kind0LikeEvent[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  supplementalLatestActivityByAuthor: Map<string, number>;
  removeCachedRelayProfile: (relayUrl: string) => void;
}

function arePeopleListsEqual(previous: Person[], next: Person[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((person, index) => {
    const candidate = next[index];
    return (
      person.id === candidate.id &&
      person.name === candidate.name &&
      person.displayName === candidate.displayName &&
      person.nip05 === candidate.nip05 &&
      person.about === candidate.about &&
      person.avatar === candidate.avatar &&
      person.isOnline === candidate.isOnline &&
      person.onlineStatus === candidate.onlineStatus &&
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
  const [people, setPeople] = useState<Person[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState<Kind0LikeEvent[]>(() =>
    loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls)
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
    const nextScoped = loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls);
    setCachedKind0Events((previous) => (areKind0EventListsEqual(previous, nextScoped) ? previous : nextScoped));
    const nextFallback = loadCachedKind0Events();
    setFallbackKind0Events((previous) => (areKind0EventListsEqual(previous, nextFallback) ? previous : nextFallback));
    // Equivalent normalized relay scopes should not trigger another cache refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheRevision, selectedRelayScopeKey]);

  const latestPresenceByAuthor = useMemo(() => {
    const nowUnix = Math.floor(Date.now() / 1000);
    return deriveLatestPresenceByAuthor(
      nostrEvents.filter((event) => event.kind === NostrEventKind.UserStatus),
      nowUnix
    );
  }, [nostrEvents]);

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
    if (liveKind0Events.length === 0) return;
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

    let storageChanged = false;
    eventsByRelayUrl.forEach((events, relayUrl) => {
      const existing = loadCachedKind0Events(relayUrl);
      if (saveCachedKind0Events([...existing, ...events], relayUrl)) {
        storageChanged = true;
      }
    });
    if (storageChanged) {
      setCacheRevision((previous) => previous + 1);
    }
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
    const previous = loadCachedKind0Events();
    const next = rememberCachedKind0Profile(
      profileCachePayload.pubkey,
      {
        name: profileCachePayload.profile.name,
        displayName: profileCachePayload.profile.displayName,
        about: profileCachePayload.profile.about,
        picture: profileCachePayload.profile.picture,
        nip05: profileCachePayload.profile.nip05,
      }
    );
    if (next.length !== previous.length || next.some((event, index) => event.content !== previous[index]?.content || event.pubkey !== previous[index]?.pubkey)) {
      setCacheRevision((revision) => revision + 1);
    }
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

      const sortedPeople = sortPeopleByPriority(next);
      return arePeopleListsEqual(prev, sortedPeople) ? prev : sortedPeople;
    });
  }, [cachedKind0Events, fallbackKind0Events, loggedInIdentityPriority, user, visiblePubkeys]);

  const removeCachedRelayProfile = useCallback((relayUrl: string) => {
    removeCachedKind0EventsByRelayUrl(relayUrl);
    setCacheRevision((previous) => previous + 1);
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
