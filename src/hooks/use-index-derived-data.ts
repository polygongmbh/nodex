import { useMemo, useRef } from "react";
import type { Task, Channel, Person, Relay, TaskStatus } from "@/types";
import type { CachedNostrEvent } from "@/lib/nostr/event-cache";
import type { NostrUser } from "@/lib/nostr/ndk-context";
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
import { resolveCurrentUser } from "@/lib/current-user";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskStateEventKind } from "@/lib/nostr/task-state-events";
import { isPriorityPropertyEvent } from "@/lib/nostr/task-property-events";
import { deriveSidebarPeople } from "@/domain/content/sidebar-people";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
const INITIAL_CHANNEL_SEED_LIMIT = 16;

export interface UseIndexDerivedDataOptions {
  // Raw event sources
  nostrEvents: CachedNostrEvent[];
  localTasks: Task[];
  postedTags: string[];
  suppressedNostrEventIds: Set<string>;
  // People
  people: Person[];
  supplementalLatestActivityByAuthor: Map<string, number>;
  cachedKind0Events: CachedNostrEvent[];
  // NDK user
  user: NostrUser | null;
  // Relay/scope state
  effectiveActiveRelayIds: Set<string>;
  relays: Relay[];
  channelFrecencyState: ChannelFrecencyState;
  /** When true, skip expensive event conversion and return the last committed snapshot. */
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
  sidebarPeople: Person[];
  currentUser: Person | undefined;
  hasCachedCurrentUserProfileMetadata: boolean;
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
  isHydrating = false,
}: UseIndexDerivedDataOptions): UseIndexDerivedDataResult {
  // Filter nostr events - only keep those with tags and not spam
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

  // Convert filtered Nostr events to tasks.
  // During the initial backfill burst (isHydrating=true) we skip the expensive
  // conversion and return the last committed snapshot instead, so that downstream
  // memos (allTasks, channels, etc.) don't cascade-invalidate on every flush.
  // The conversion runs once when isHydrating transitions to false (after EOSE).
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

  // Combine local tasks with Nostr tasks, dedup, and overlay optimistic status
  const allTasks = useMemo(() => {
    const localTasksForMerge = filterPendingLocalTasksForMerge(localTasks, nostrTasks);
    return dedupeMergedTasks(mergeTasks(localTasksForMerge, nostrTasks));
  }, [localTasks, nostrTasks]);

  const personalizedChannelScores = useMemo(
    () => getChannelFrecencyScores(channelFrecencyState),
    [channelFrecencyState]
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

  // Sidebar channels: selected-feed scoped, personalized, dampened by usage
  const channels: Channel[] = useMemo(() => {
    return deriveChannels(
      scopedLocalTasksForChannels,
      scopedNostrEventsForChannels,
      postedTags,
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
    personalizedChannelScores,
  ]);

  // Compose autocomplete channels: all known tags
  const composeChannels: Channel[] = useMemo(() => {
    return deriveChannels(localTasks, filteredNostrEvents, postedTags, 1);
  }, [localTasks, filteredNostrEvents, postedTags]);

  const sidebarPeople = useMemo(() => {
    return deriveSidebarPeople(people, allTasks, supplementalLatestActivityByAuthor);
  }, [allTasks, people, supplementalLatestActivityByAuthor]);

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
    sidebarPeople,
    currentUser,
    hasCachedCurrentUserProfileMetadata,
  };
}
