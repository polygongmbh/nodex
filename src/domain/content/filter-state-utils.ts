import type { Channel } from "@/types";

export function buildChannelFilterMap(
  channels: Channel[],
  resolveState: (channel: Channel) => Channel["filterState"]
): Map<string, Channel["filterState"]> {
  const next = new Map<string, Channel["filterState"]>();
  for (const channel of channels) {
    next.set(channel.id, resolveState(channel));
  }
  return next;
}

export function setAllChannelFilters(
  channels: Channel[],
  state: Channel["filterState"]
): Map<string, Channel["filterState"]> {
  return buildChannelFilterMap(channels, () => state);
}

export function setExclusiveChannelFilter(
  channels: Channel[],
  includedChannelId: string
): Map<string, Channel["filterState"]> {
  return buildChannelFilterMap(channels, (channel) =>
    channel.id === includedChannelId ? "included" : "neutral"
  );
}

export function shouldToggleOffExclusiveChannel(
  channels: Channel[],
  channelFilterStates: Map<string, Channel["filterState"]>,
  targetChannelId: string
): boolean {
  let includedCount = 0;
  let targetIncluded = false;

  for (const channel of channels) {
    const state = channelFilterStates.get(channel.id) || "neutral";
    if (state !== "included") continue;
    includedCount += 1;
    if (channel.id === targetChannelId) {
      targetIncluded = true;
    }
  }

  return targetIncluded && includedCount === 1;
}

export function shouldToggleOffExclusivePerson(
  selectedPubkeys: Set<string>,
  targetPersonPubkey: string
): boolean {
  return selectedPubkeys.has(targetPersonPubkey) && selectedPubkeys.size === 1;
}
