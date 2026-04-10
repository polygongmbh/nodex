import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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

function buildPriorityLookup(prioritizedPubkeys: string[]): Map<string, number> {
  return new Map(prioritizedPubkeys.map((pubkey, index) => [pubkey.toLowerCase(), index] as const));
}

function sortPeopleByPriority(people: Person[], priorityLookup: Map<string, number>): Person[] {
  return [...people].sort((a, b) => {
    const aPriority = priorityLookup.get(a.id.toLowerCase());
    const bPriority = priorityLookup.get(b.id.toLowerCase());
    if (aPriority !== undefined && bPriority !== undefined) return aPriority - bPriority;
    if (aPriority !== undefined) return -1;
    if (bPriority !== undefined) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

function mergeDerivedPeopleWithInteractiveState(
  derivedPeople: Person[],
  interactivePeople: Person[],
  priorityLookup: Map<string, number>
): Person[] {
  const interactiveById = new Map(interactivePeople.map((person) => [person.id, person]));
  const merged = derivedPeople.map((person) => {
    const interactivePerson = interactiveById.get(person.id);
    if (!interactivePerson) return person;
    return {
      ...person,
      isSelected: interactivePerson.isSelected,
    };
  });

  interactivePeople.forEach((person) => {
    if (interactiveById.has(person.id) && !derivedPeople.some((entry) => entry.id === person.id)) {
      merged.push(person);
    }
  });

  return sortPeopleByPriority(merged, priorityLookup);
}

function buildPersistedRelayKind0Key(event: Kind0LikeEvent, relayUrl: string): string {
  return [
    relayUrl.trim().replace(/\/+$/, ""),
    event.pubkey.trim().toLowerCase(),
    event.created_at || 0,
    event.content,
  ].join("|");
}

function buildDerivedPeople(
  visiblePubkeys: string[],
  cachedKind0Events: Kind0LikeEvent[],
  fallbackKind0Events: Kind0LikeEvent[],
  user: NostrUserLike | null,
  loggedInIdentityPriority: string[]
): Person[] {
  const priorityLookup = buildPriorityLookup(loggedInIdentityPriority);
  let people = derivePeopleFromKind0Events(
    visiblePubkeys,
    cachedKind0Events,
    fallbackKind0Events,
    [],
    {
      prioritizedPubkeys: loggedInIdentityPriority,
    }
  );

  if (user?.pubkey && !people.some((person) => person.id === user.pubkey)) {
    people = [
      ...people,
      {
        id: user.pubkey,
        name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
        displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
        nip05: user.profile?.nip05?.trim().toLowerCase(),
        avatar: user.profile?.picture,
        isOnline: true,
        onlineStatus: "online",
        isSelected: false,
      },
    ];
  }

  return sortPeopleByPriority(people, priorityLookup);
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
  const [interactivePeople, setInteractivePeople] = useState<Person[]>([]);
  const [cachedKind0Events, setCachedKind0Events] = useState<Kind0LikeEvent[]>(() =>
    loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls)
  );
  const [fallbackKind0Events, setFallbackKind0Events] = useState<Kind0LikeEvent[]>(() => loadCachedKind0Events());
  const [loggedInIdentityPriority, setLoggedInIdentityPriority] = useState(() => loadLoggedInIdentityPriority());
  const [cacheRevision, setCacheRevision] = useState(0);
  const persistedRelayKind0KeysRef = useRef<Set<string>>(new Set());

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
    setCachedKind0Events(loadCachedKind0EventsForRelayUrls(normalizedSelectedRelayUrls));
    setFallbackKind0Events(loadCachedKind0Events());
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
    const eventsByRelayUrl = new Map<string, Kind0LikeEvent[]>();
    liveKind0Events.forEach((event) => {
      event.relayUrls.forEach((relayUrl) => {
        const persistedRelayKind0Key = buildPersistedRelayKind0Key(event, relayUrl);
        if (persistedRelayKind0KeysRef.current.has(persistedRelayKind0Key)) {
          return;
        }
        persistedRelayKind0KeysRef.current.add(persistedRelayKind0Key);
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
          [
            ...nostrEvents.map((event) => event.pubkey?.trim().toLowerCase()),
            ...cachedKind0Events.map((event) => event.pubkey?.trim().toLowerCase()),
          ]
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        )
      ),
    [cachedKind0Events, nostrEvents]
  );

  const priorityLookup = useMemo(
    () => buildPriorityLookup(loggedInIdentityPriority),
    [loggedInIdentityPriority]
  );
  const derivedPeople = useMemo(
    () => buildDerivedPeople(
      visiblePubkeys,
      cachedKind0Events,
      fallbackKind0Events,
      user,
      loggedInIdentityPriority
    ),
    [cachedKind0Events, fallbackKind0Events, loggedInIdentityPriority, user, visiblePubkeys]
  );
  const derivedPeopleRef = useRef(derivedPeople);
  derivedPeopleRef.current = derivedPeople;

  const previousPeopleRef = useRef<Person[]>([]);
  const people = useMemo(() => {
    const next = mergeDerivedPeopleWithInteractiveState(derivedPeople, interactivePeople, priorityLookup);
    if (arePeopleListsEqual(previousPeopleRef.current, next)) return previousPeopleRef.current;
    previousPeopleRef.current = next;
    return next;
  }, [derivedPeople, interactivePeople, priorityLookup]);

  const setPeople = useCallback<Dispatch<SetStateAction<Person[]>>>((value) => {
    setInteractivePeople((previousInteractivePeople) => {
      const previousMergedPeople = mergeDerivedPeopleWithInteractiveState(
        derivedPeopleRef.current,
        previousInteractivePeople,
        priorityLookup
      );
      const result = typeof value === "function" ? value(previousMergedPeople) : value;
      // If the functional update returned the same reference (no change), bail out
      // so React does not see a new state value and skips the re-render.
      if (result === previousMergedPeople) return previousInteractivePeople;
      return result;
    });
  }, [priorityLookup]);

  const removeCachedRelayProfile = useCallback((relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrlScope([relayUrl])[0];
    if (normalizedRelayUrl) {
      persistedRelayKind0KeysRef.current.forEach((key) => {
        if (!key.startsWith(`${normalizedRelayUrl}|`)) return;
        persistedRelayKind0KeysRef.current.delete(key);
      });
    }
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
