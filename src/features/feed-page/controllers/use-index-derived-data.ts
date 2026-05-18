import { useEffect, useMemo, useRef } from "react";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import {
  bootstrapReactions,
  mergeReactionEvents,
  setReactionsViewerPubkey,
} from "@/features/feed-page/stores/reactions-registry";
import { useCachedPosts } from "@/features/feed-page/controllers/use-cached-posts";
import type { Post, Channel, Relay, TaskStatus, PostedTag } from "@/types";
import type { Person, SelectablePerson, SidebarPerson } from "@/types/person";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import type { Kind0LikeEvent } from "@/infrastructure/nostr/people-from-kind0";
import type { NDKUser } from "@/infrastructure/nostr/ndk-context";
import type { LatestPresenceSnapshot } from "@/lib/presence-status";
import { nostrEventsToTasks } from "@/infrastructure/nostr/task-converter";
import { findSpamKeyword } from "@/lib/nostr/spam-filter";
import {
  applyTaskSortOverlays,
  dedupeMergedTasks,
} from "@/domain/content/task-collections";
import { mergeTasks } from "@/domain/content/task-merge";
import { preserveTaskListIdentity } from "@/domain/content/task-identity";
import { deriveChannels } from "@/domain/content/channels";
import { useCoreChannels } from "@/lib/use-core-channels";
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
import { derivePeopleFromKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import { hasCurrentUserProfileMetadata as resolveCurrentUserProfileMetadata } from "@/domain/auth/profile-metadata";

const spamDropCountsByRelay = new Map<string, number>();
function logSpamDrop(event: CachedNostrEvent, keyword: string): void {
  const relayKey = event.relayUrl || event.relayUrls?.[0] || "unknown";
  const prev = spamDropCountsByRelay.get(relayKey) ?? 0;
  spamDropCountsByRelay.set(relayKey, prev + 1);
  if (prev === 0) {
    console.debug(
      `[spam-filter] dropped kind-1 event ${event.id} from ${relayKey} (matched "${keyword}")`
    );
  } else if (prev + 1 === 10 || (prev + 1) % 100 === 0) {
    console.debug(`[spam-filter] ${prev + 1} kind-1 events dropped from ${relayKey}`);
  }
}

export interface UseIndexDerivedDataOptions {
  nostrEvents: CachedNostrEvent[];
  demoTasks: Post[];
  people: SelectablePerson[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  cachedKind0Events: Kind0LikeEvent[];
  user: NDKUser | null;
  effectiveActiveRelayIds: Set<string>;
  relays: Relay[];
  channelFrecencyState: ChannelFrecencyState;
  personFrecencyState: PersonFrecencyState;
  isHydrating?: boolean;
  feedScopeKey: string;
  hasLiveHydratedScope: boolean;
}

export interface UseIndexDerivedDataResult {
  nostrTasks: Post[];
  allTasks: Post[];
  personalizedChannelScores: Map<string, number>;
  channels: Channel[];
  composeChannels: Channel[];
  mentionAutocompletePeople: SelectablePerson[];
  sidebarPeople: SidebarPerson[];
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
  feedScopeKey,
  hasLiveHydratedScope,
}: UseIndexDerivedDataOptions): UseIndexDerivedDataResult {
  const localTasks = useTaskMutationStore((s) => s.localTasks);
  const postedTags = useTaskMutationStore((s) => s.postedTags);
  const suppressedNostrEventIds = useTaskMutationStore((s) => s.suppressedNostrEventIds);
  const { coreChannels } = useCoreChannels();
  const filteredNostrEvents = useMemo(() => {
    return nostrEvents.filter((event) => {
      if (suppressedNostrEventIds.has(event.id)) return false;
      if (event.kind === NostrEventKind.Metadata) return false;
      if (isTaskStateEventKind(event.kind)) return true;
      if (isPriorityPropertyEvent(event.kind, event.tags)) return true;
      if (event.kind === NostrEventKind.ClassifiedListing) return true;
      if (event.kind === NostrEventKind.Reaction) return true;
      if (event.kind === NostrEventKind.EventDeletion) return true;
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
      if (event.kind === NostrEventKind.TextNote) {
        const spamKeyword = findSpamKeyword(event.content);
        if (spamKeyword) {
          logSpamDrop(event, spamKeyword);
          return false;
        }
      }
      return true;
    });
  }, [nostrEvents, suppressedNostrEventIds]);

  const lastNostrTasksRef = useRef<Post[]>([]);
  const nostrTasks: Post[] = useMemo(() => {
    if (isHydrating) return lastNostrTasksRef.current;
    const fresh = nostrEventsToTasks(
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
      })),
    );
    const tasks = preserveTaskListIdentity(lastNostrTasksRef.current, fresh);
    lastNostrTasksRef.current = tasks;
    return tasks;
  }, [filteredNostrEvents, isHydrating]);

  // Reactions registry maintains its own bookkeeping; we only need to push
  // the delta of new reaction/deletion events each render. If the scope just
  // reset (some previously-processed event is no longer present) we rebootstrap
  // from scratch instead of merging.
  const seenReactionishEventIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    setReactionsViewerPubkey(user?.pubkey);
  }, [user?.pubkey]);
  useEffect(() => {
    const relevantEvents = filteredNostrEvents.filter(
      (event) =>
        event.kind === NostrEventKind.Reaction ||
        event.kind === NostrEventKind.EventDeletion,
    );
    const currentIds = new Set(relevantEvents.map((event) => event.id));
    const seen = seenReactionishEventIdsRef.current;
    let scopeReset = false;
    for (const id of seen) {
      if (!currentIds.has(id)) {
        scopeReset = true;
        break;
      }
    }
    if (scopeReset) {
      bootstrapReactions(relevantEvents, user?.pubkey);
      seenReactionishEventIdsRef.current = currentIds;
      return;
    }
    const delta = relevantEvents.filter((event) => !seen.has(event.id));
    if (delta.length > 0) {
      mergeReactionEvents(delta);
      for (const event of delta) seen.add(event.id);
    }
  }, [filteredNostrEvents, user?.pubkey]);

  const cachedPosts = useCachedPosts({
    feedScopeKey,
    postsToPersist: nostrTasks,
    canPersist: hasLiveHydratedScope,
  });

  const allTasks = useMemo(() => {
    // Cached posts hydrate the timeline before live events arrive; mergeTasks
    // dedupes by id and prefers the freshest version, so a stale cached entry
    // gets overwritten as soon as the live event comes back from the relay.
    const cachedAndLive = dedupeMergedTasks(mergeTasks(cachedPosts, nostrTasks));
    const fixtureAndNostrTasks = dedupeMergedTasks(mergeTasks(demoTasks, cachedAndLive));
    return dedupeMergedTasks(mergeTasks(localTasks, fixtureAndNostrTasks));
  }, [cachedPosts, demoTasks, localTasks, nostrTasks]);

  const personalizedChannelScores = useMemo(
    () => getChannelFrecencyScores(channelFrecencyState),
    [channelFrecencyState]
  );
  const personalizedPersonScores = useMemo(
    () => getPersonFrecencyScores(personFrecencyState),
    [personFrecencyState]
  );

  const scopedPostsForChannels = useMemo(() => {
    const channelRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return allTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => channelRelayScopeIds.has(relayId))
    );
  }, [allTasks, effectiveActiveRelayIds, relays]);

  const channels: Channel[] = useMemo(() => {
    const scopedPostedTags = getPostedTagsForRelayScope(
      postedTags,
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return deriveChannels(scopedPostsForChannels, scopedPostedTags, {
      minCount: 2,
      personalizeScores: personalizedChannelScores,
      sortVisibleAlphabetically: true,
      coreChannels,
      userPubkey: user?.pubkey,
    });
  }, [
    scopedPostsForChannels,
    postedTags,
    effectiveActiveRelayIds,
    personalizedChannelScores,
    relays,
    coreChannels,
    user?.pubkey,
  ]);

  const composeChannels: Channel[] = useMemo(() => {
    const scopedPostedTags = getPostedTagsForRelayScope(
      postedTags,
      effectiveActiveRelayIds,
      relays.map((relay) => relay.id)
    );
    return deriveChannels(scopedPostsForChannels, scopedPostedTags, {
      minCount: 1,
      coreChannels,
      userPubkey: user?.pubkey,
    });
  }, [postedTags, scopedPostsForChannels, effectiveActiveRelayIds, relays, coreChannels, user?.pubkey]);

  const mentionAutocompletePeople = useMemo(() => {
    const visiblePubkeys = Array.from(
      new Set(
        [
          ...scopedPostsForChannels.map((task) => task.author.pubkey?.trim().toLowerCase()),
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
  }, [cachedKind0Events, people, scopedPostsForChannels]);

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
    nostrTasks,
    allTasks,
    personalizedChannelScores,
    channels,
    composeChannels,
    mentionAutocompletePeople,
    sidebarPeople,
    currentUser,
    hasCurrentUserProfileMetadata,
  };
}
