import { useEffect, useMemo } from "react";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useCachedPosts } from "@/features/feed-page/controllers/use-cached-posts";
import { useMentionAutocompletePeople } from "@/features/feed-page/controllers/use-mention-autocomplete-people";
import type { Post, Channel, Relay, TaskStatus, PostedTag } from "@/types";
import type { Person, SelectablePerson, SidebarPerson } from "@/types/person";
import type { NostrEvent } from "@/lib/nostr/types";
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

const EMPTY_POSTS: Post[] = [];

export interface UseIndexDerivedDataOptions {
  demoTasks: Post[];
  people: SelectablePerson[];
  latestPresenceByAuthor: Map<string, LatestPresenceSnapshot>;
  cachedKind0Events: NostrEvent[];
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
    postsToPersist: nostrTasks,
    canPersist: hasLiveHydratedScope,
  });

  const allTasks = useMemo(() => {
    // Cached posts only hydrate the cold-start view. Once the live subscription
    // has replayed, nostrTasks is authoritative — including for deletions and
    // suppressions that the cache layer doesn't know about, so we drop cached
    // posts from the merge to avoid resurrecting removed ids.
    const hydrationPosts = hasLiveHydratedScope ? EMPTY_POSTS : cachedPosts;
    return dedupeMergedTasks([
      ...localTasks,
      ...demoTasks,
      ...hydrationPosts,
      ...nostrTasks,
    ]);
  }, [cachedPosts, demoTasks, localTasks, nostrTasks, hasLiveHydratedScope]);

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
    const derived = deriveChannels(scopedPostsForChannels, scopedPostedTags, {
      personalizeScores: personalizedChannelScores,
      coreChannels,
      userPubkey: user?.pubkey,
    });
    return [...derived].sort((a, b) => a.name.localeCompare(b.name));
  }, [
    scopedPostsForChannels,
    postedTags,
    effectiveActiveRelayIds,
    personalizedChannelScores,
    relays,
    coreChannels,
    user?.pubkey,
  ]);

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
    mentionAutocompletePeople,
    sidebarPeople,
    currentUser,
    hasCurrentUserProfileMetadata,
  };
}
