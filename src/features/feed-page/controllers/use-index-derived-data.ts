import { useEffect, useMemo } from "react";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useCachedPosts } from "@/features/feed-page/controllers/use-cached-posts";
import { useMentionAutocompletePeople } from "@/features/feed-page/controllers/use-mention-autocomplete-people";
import type { Post, Channel, Relay, TaskStatus, PostedTag } from "@/types";
import type { Person, SelectablePerson, SidebarPerson } from "@/types/person";
import type { Kind0LikeEvent } from "@/infrastructure/nostr/people-from-kind0";
import {
  setPostsSuppression,
  usePosts,
} from "@/features/feed-page/stores/posts-store";
import type { NDKUser } from "@/infrastructure/nostr/ndk-context";
import type { LatestPresenceSnapshot } from "@/lib/presence-status";
import {
  applyTaskSortOverlays,
  dedupeMergedTasks,
} from "@/domain/content/task-collections";
import { mergeTasks } from "@/domain/content/task-merge";
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
import { deriveSidebarPeople } from "@/domain/content/sidebar-people";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { hasCurrentUserProfileMetadata as resolveCurrentUserProfileMetadata } from "@/domain/auth/profile-metadata";

export interface UseIndexDerivedDataOptions {
  demoTasks: Post[];
  people: SelectablePerson[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  cachedKind0Events: Kind0LikeEvent[];
  user: NDKUser | null;
  effectiveActiveRelayIds: Set<string>;
  relays: Relay[];
  channelFrecencyState: ChannelFrecencyState;
  personFrecencyState: PersonFrecencyState;
  hasLiveHydratedScope: boolean;
}

export interface UseIndexDerivedDataResult {
  allTasks: Post[];
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
  demoTasks,
  people,
  latestPresenceByAuthor,
  cachedKind0Events,
  user,
  effectiveActiveRelayIds,
  relays,
  channelFrecencyState,
  personFrecencyState,
  hasLiveHydratedScope,
}: UseIndexDerivedDataOptions): UseIndexDerivedDataResult {
  const localTasks = useTaskMutationStore((s) => s.localTasks);
  const postedTags = useTaskMutationStore((s) => s.postedTags);
  const suppressedNostrEventIds = useTaskMutationStore((s) => s.suppressedNostrEventIds);
  const { coreChannels } = useCoreChannels();

  // Push the suppression set down so posts-store can skip suppressed ids
  // when projecting. Re-renders driven only by suppression are dropped by
  // posts-store's set-equality check.
  useEffect(() => {
    setPostsSuppression(suppressedNostrEventIds);
  }, [suppressedNostrEventIds]);

  const nostrTasks: Post[] = usePosts();

  const cachedPosts = useCachedPosts({
    activeRelayIds: effectiveActiveRelayIds,
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

  const mentionAutocompletePeople = useMentionAutocompletePeople({
    scopedPosts: scopedPostsForChannels,
    cachedKind0Events,
    people,
  });

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
    allTasks,
    channels,
    composeChannels,
    mentionAutocompletePeople,
    sidebarPeople,
    currentUser,
    hasCurrentUserProfileMetadata,
  };
}
