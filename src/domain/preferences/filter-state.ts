import type { Channel, ChannelMatchMode } from "@/types";

export const DEFAULT_CHANNEL_MATCH_MODE: ChannelMatchMode = "and";

export function isPersistedChannelFilterState(
  state: unknown
): state is Exclude<Channel["filterState"], "neutral"> {
  return state === "included" || state === "excluded";
}

export function getEffectiveActiveRelayIds(
  activeRelayIds: Set<string>,
  availableRelayIds: string[]
): Set<string> {
  const availableSet = new Set(availableRelayIds);
  return new Set(Array.from(activeRelayIds).filter((relayId) => availableSet.has(relayId)));
}
