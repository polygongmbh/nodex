import { useMemo, useRef } from "react";
import { useFeedTaskMutationStore } from "@/features/feed-page/stores/feed-task-mutation-store";
import type { Task, Channel, Relay, TaskStatus, PostedTag } from "@/types";
import type { Person } from "@/types/person";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import type { Kind0LikeEvent } from "@/infrastructure/nostr/people-from-kind0";
import type { NDKUser } from "@/infrastructure/nostr/ndk-context";
import type { LatestPresenceSnapshot } from "@/lib/presence-status";
import {
  nostrEventsToTasks,
  isSpamContent,
} from "@/infrastructure/nostr/task-converter";
import {
  applyTaskSortOverlays,
  dedupeMergedTasks,
  filterPendingLocalTasksForMerge,
} from "@/domain/content/task-collections";
import { mergeTasks } from "@/domain/content/task-merge";
import { deriveChannels } from "@/domain/content/channels";
import {
  getChannelFrecencyScores,
  type ChannelFrecencyState,
} from "@/lib/channel-frecency";
import {
  getPersonFrecencyScores,
  type PersonFrecencyState,
} from "@/lib/person-frecency";
import { resolveCurrentUser } from "@/lib/current-user";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskStateEventKind } from "@/infrastructure/nostr/task-state-events";
import { isPriorityPropertyEvent } from "@/infrastructure/nostr/task-property-events";
import { deriveSidebarPeople } from "@/domain/content/sidebar-people";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
import { derivePeopleFromKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import { hasCurrentUserProfileMetadata as resolveCurrentUserProfileMetadata } from "@/domain/auth/profile-metadata";

const INITIAL_CHANNEL_SEED_LIMIT = 16;

export interface UseIndexDerivedDataOptions {
  nostrEvents: CachedNostrEvent[];
  demoTasks: Task[];
  people: Person[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  cachedKind0Events: Kind0LikeEvent[];
  user: NDKUser | null;
  effectiveActiveRelayIds: Set<string>;
  relays: Relay[];
  channelFrecencyState: ChannelFrecencyState;
  personFrecencyState: PersonFrecencyState;
  isHydrating?: boolean;
}

export interface UseIndexDerivedDataResult {
  filteredNostrEvents: CachedNostrEvent[];
  nostrTasks: Task[];
  allTasks: Task[];
  personalizedChannelScores: Map<string, number>;
  scopedLocalTasksForChannels: Task[];
  scopedNostrEventsForChannels: CachedNostrEvent[];
  channels: Channel[];
  composeChannels: Channel[];
  mentionAutocompletePeople: Person[];
  sidebarPeople: Person[];
  currentUser: Person | undefined;
  hasCurrentUserProfileMetadata: boolean;
}

function getPostedTagsForRelayScope(
  postedTags: PostedTag[],
  activeRelayIds: Set<string>,
  allRelayIds: string[]
): PostedTag[] {
  if (postedTags.length === 0) return postedTags;
  const scopedRelayIds = resolveChannelRelayScopeIds(activeRelayIds, allRelayIds);
  return postedTags.filter((tag) => {
    if (tag.relayIds.length === 0) return true;
    return tag.relayIds.some((relayId) => scopedRelayIds.has(relayId));
  });
}

export function useIndexDerivedData({
  nostrEvents,
  demoTasks,
  people,
  latestPresenceByAuthor,
  cachedKind0Events,
  user,
  effectiveActiveRelayIds,
  relays,
  channelFrecencyState,
  personFrecencyState,
  isHydrating = false,
}: UseIndexDerivedDataOptions): UseIndexDerivedDataResult {
  const localTasks = useFeedTaskMutationStore((s) => s.localTasks);
  const postedTags = useFeedTaskMutationStore((s) => s.postedTags);
  const suppressedNostrEventIds = useFeedTaskMutationStore((s) => s.suppressedNostrEventIds);
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter((event) => {
      if (suppressedNostrEventIds.has(event.id)) return false;
      if (event.kind === NostrEventKind.Metadata) return false;
      if (isTaskStateEventKind(event.kind)) return true;
      if (isPriorityPropertyEvent(event.kind, event.tags)) return true;
      if (event.kind === NostrEventKind.ClassifiedListing) return true;
      if (
        event.kind === NostrEventKind.CalendarDateBased ||
        event.kind === NostrEventKind.CalendarTimeBased
      ) {
        return true;
      }
      const hasTags =
        event.tags.some((tag) => tag[0]?.toLowerCase() === "t" && tag[1]) ||
        /#\w+/.test(event.content);
      if (!hasTags) return false;
      if (isSpamContent(event.content)) return false;
      return true;
    });
  }, [nostrEvents, suppressedNostrEventIds]);

  const lastNostrTasksRef = useRef<Task[]>([]);
  const nostrTasks: Task[] = useMemo(() => {
    if (isHydrating) return lastNostrTasksRef.current;
    const tasks = nostrEventsToTasks(
      filteredNostrEvents.map((event) => ({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind as NostrEventKind,
        tags: event.tags,
        content: event.content,
        sig: event.sig || "",
        relayUrl: event.relayUrl,
        relayUrls: event.relayUrls,
      }))
    );
    lastNostrTasksRef.current = tasks;
    return tasks;
  }, [filteredNostrEvents, isHydrating]);

  const allTasks = useMemo(() => {
    const fixtureAndNostrTasks = dedupeMergedTasks(mergeTasks(demoTasks, nostrTasks));
    const localTasksForMerge = filterPendingLocalTasksForMerge(localTasks, fixtureAndNostrTasks);
    return dedupeMergedTasks(mergeTasks(localTasksForMerge, fixtureAndNostrTasks));
  }, [demoTasks, localTasks, nostrTasks]);

  const personalizedChannelScores = useMemo(
    () => getChannelFrecencyScores(channelFrecencyState),
    [channelFrecencyState]
  );
  const personalizedPersonScores = useMemo(
    () => getPersonFrecencyScores(personFrecencyState),
    [personFrecencyState]
  );

  const scopedSeedTasksForChannels = useMemo(() => {
    const channelRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return [...demoTasks, ...localTasks].filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => channelRelayScopeIds.has(relayId))
    );
  }, [demoTasks, effectiveActiveRelayIds, localTasks, relays]);

  const scopedNostrEventsForChannels = useMemo(() => {
    const channelRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return filteredNostrEvents.filter((event) => {
      const relayUrls = [
        ...(event.relayUrls || []),
        ...(event.relayUrl ? [event.relayUrl] : []),
      ]
        .map((url) => url.trim().replace(/\/+$/, ""))
        .filter((url) => Boolean(url));
      if (relayUrls.length === 0) return false;
      return relayUrls.some((relayUrl) =>
        channelRelayScopeIds.has(getRelayIdFromUrl(relayUrl))
      );
    });
  }, [effectiveActiveRelayIds, filteredNostrEvents, relays]);

  const channels: Channel[] = useMemo(() => {
    const scopedPostedTags = getPostedTagsForRelayScope(
      postedTags,
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return deriveChannels(
      scopedSeedTasksForChannels,
      scopedNostrEventsForChannels,
      scopedPostedTags,
      {
        minCount: 6,
        personalizeScores: personalizedChannelScores,
        maxCount: INITIAL_CHANNEL_SEED_LIMIT,
        sortVisibleAlphabetically: true,
      }
    );
  }, [
    scopedSeedTasksForChannels,
    scopedNostrEventsForChannels,
    postedTags,
    effectiveActiveRelayIds,
    personalizedChannelScores,
    relays,
  ]);

  const composeChannels: Channel[] = useMemo(() => {
    const scopedPostedTags = getPostedTagsForRelayScope(
      postedTags,
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return deriveChannels(scopedSeedTasksForChannels, scopedNostrEventsForChannels, scopedPostedTags, 1);
  }, [postedTags, scopedSeedTasksForChannels, scopedNostrEventsForChannels, effectiveActiveRelayIds, relays]);

  const mentionAutocompletePeople = useMemo(() => {
    const visiblePubkeys = Array.from(
      new Set(
        [
          ...scopedNostrEventsForChannels.map((event) => event.pubkey?.trim().toLowerCase()),
          ...cachedKind0Events.map((event) => event.pubkey?.trim().toLowerCase()),
        ].filter((pubkey): pubkey is string => Boolean(pubkey))
      )
    );

    if (visiblePubkeys.length === 0) return [];

    return derivePeopleFromKind0Events(
      visiblePubkeys,
      cachedKind0Events,
      cachedKind0Events,
      people
    );
  }, [cachedKind0Events, people, scopedNostrEventsForChannels]);

  const scopedTasksForSidebarPeople = useMemo(() => {
    const sidebarRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );

    return allTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => sidebarRelayScopeIds.has(relayId))
    );
  }, [allTasks, effectiveActiveRelayIds, relays]);

  const sidebarPeople = useMemo(() => {
    return deriveSidebarPeople(
      people,
      scopedTasksForSidebarPeople,
      latestPresenceByAuthor,
      new Date(),
      { personalizeScores: personalizedPersonScores }
    );
  }, [latestPresenceByAuthor, people, scopedTasksForSidebarPeople, personalizedPersonScores]);

  const currentUser = resolveCurrentUser(people, user);

  const hasCurrentUserProfileMetadata = useMemo(
    () => resolveCurrentUserProfileMetadata(user, cachedKind0Events),
    [cachedKind0Events, user]
  );

  return {
    filteredNostrEvents,
    nostrTasks,
    allTasks,
    personalizedChannelScores,
    scopedLocalTasksForChannels: scopedSeedTasksForChannels,
    scopedNostrEventsForChannels,
    channels,
    composeChannels,
    mentionAutocompletePeople,
    sidebarPeople,
    currentUser,
    hasCurrentUserProfileMetadata,
  };
}
