import { useMemo, useRef } from "react";
import type { Task, Channel, Person, Relay, TaskStatus, PostedTag } from "@/types";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import type { Kind0LikeEvent } from "@/infrastructure/nostr/people-from-kind0";
import type { NostrUser } from "@/infrastructure/nostr/ndk-context";
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

const INITIAL_CHANNEL_SEED_LIMIT = 16;

export interface UseIndexDerivedDataOptions {
  nostrEvents: CachedNostrEvent[];
  localTasks: Task[];
  postedTags: PostedTag[];
  suppressedNostrEventIds: Set<string>;
  people: Person[];
  supplementalLatestActivityByAuthor: Map<string, number>;
  cachedKind0Events: Kind0LikeEvent[];
  user: NostrUser | null;
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
  hasCachedCurrentUserProfileMetadata: boolean;
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
  localTasks,
  postedTags,
  suppressedNostrEventIds,
  people,
  supplementalLatestActivityByAuthor,
  cachedKind0Events,
  user,
  effectiveActiveRelayIds,
  relays,
  channelFrecencyState,
  personFrecencyState,
  isHydrating = false,
}: UseIndexDerivedDataOptions): UseIndexDerivedDataResult {
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
    const localTasksForMerge = filterPendingLocalTasksForMerge(localTasks, nostrTasks);
    return dedupeMergedTasks(mergeTasks(localTasksForMerge, nostrTasks));
  }, [localTasks, nostrTasks]);

  const personalizedChannelScores = useMemo(
    () => getChannelFrecencyScores(channelFrecencyState),
    [channelFrecencyState]
  );
  const personalizedPersonScores = useMemo(
    () => getPersonFrecencyScores(personFrecencyState),
    [personFrecencyState]
  );

  const scopedLocalTasksForChannels = useMemo(() => {
    const channelRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return localTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => channelRelayScopeIds.has(relayId))
    );
  }, [effectiveActiveRelayIds, localTasks, relays]);

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
      scopedLocalTasksForChannels,
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
    scopedLocalTasksForChannels,
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
    return deriveChannels(scopedLocalTasksForChannels, scopedNostrEventsForChannels, scopedPostedTags, 1);
  }, [postedTags, scopedLocalTasksForChannels, scopedNostrEventsForChannels, effectiveActiveRelayIds, relays]);

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
      supplementalLatestActivityByAuthor,
      new Date(),
      { personalizeScores: personalizedPersonScores }
    );
  }, [people, scopedTasksForSidebarPeople, supplementalLatestActivityByAuthor, personalizedPersonScores]);

  const currentUser = resolveCurrentUser(people, user);

  const hasCachedCurrentUserProfileMetadata = useMemo(() => {
    if (!user?.pubkey) return true;
    const normalizedPubkey = user.pubkey.trim().toLowerCase();
    return cachedKind0Events.some((event) => {
      const eventPubkey =
        typeof event.pubkey === "string" ? event.pubkey.trim().toLowerCase() : "";
      return eventPubkey === normalizedPubkey && Boolean(event.content?.trim());
    });
  }, [cachedKind0Events, user?.pubkey]);

  return {
    filteredNostrEvents,
    nostrTasks,
    allTasks,
    personalizedChannelScores,
    scopedLocalTasksForChannels,
    scopedNostrEventsForChannels,
    channels,
    composeChannels,
    mentionAutocompletePeople,
    sidebarPeople,
    currentUser,
    hasCachedCurrentUserProfileMetadata,
  };
}
