import { useMemo } from "react";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { deriveChannels } from "@/domain/content/channels";
import { useCoreChannels } from "@/lib/use-core-channels";
import {
  getChannelFrecencyScores,
  type ChannelFrecencyState,
} from "@/lib/channel-frecency";
import { resolveChannelRelayScopeIds } from "@/domain/relays/relay-scope";
import type { Channel, Post, PostedTag } from "@/types";

interface UseChannelsOptions {
  allTasks: Post[];
  effectiveActiveRelayIds: Set<string>;
  allRelayIds: string[];
  channelFrecencyState: ChannelFrecencyState;
  userPubkey?: string;
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

export function useChannels({
  allTasks,
  effectiveActiveRelayIds,
  allRelayIds,
  channelFrecencyState,
  userPubkey,
}: UseChannelsOptions): Channel[] {
  const postedTags = useTaskMutationStore((s) => s.postedTags);
  const { coreChannels } = useCoreChannels();

  const personalizeScores = useMemo(
    () => getChannelFrecencyScores(channelFrecencyState),
    [channelFrecencyState]
  );

  const scopedPosts = useMemo(() => {
    const channelRelayScopeIds = resolveChannelRelayScopeIds(
      effectiveActiveRelayIds,
      allRelayIds
    );
    return allTasks.filter(
      (task) =>
        task.relays.length === 0 ||
        task.relays.some((relayId) => channelRelayScopeIds.has(relayId))
    );
  }, [allTasks, effectiveActiveRelayIds, allRelayIds]);

  return useMemo(() => {
    const scopedPostedTags = getPostedTagsForRelayScope(
      postedTags,
      effectiveActiveRelayIds,
      allRelayIds
    );
    const derived = deriveChannels(scopedPosts, scopedPostedTags, {
      personalizeScores,
      coreChannels,
      userPubkey,
    });
    return [...derived].sort((a, b) => a.name.localeCompare(b.name));
  }, [
    scopedPosts,
    postedTags,
    effectiveActiveRelayIds,
    personalizeScores,
    allRelayIds,
    coreChannels,
    userPubkey,
  ]);
}
