import type { Channel, ChannelMatchMode, Person } from "@/types";

export interface FilterSnapshot {
  relayIds: string[];
  channelStates: Record<string, "included" | "excluded">;
  selectedPeopleIds: string[];
  channelMatchMode: ChannelMatchMode;
}

interface BuildFilterSnapshotParams {
  activeRelayIds: Set<string>;
  channelFilterStates: Map<string, Channel["filterState"]>;
  people: Person[];
  channelMatchMode: ChannelMatchMode;
}

export function buildFilterSnapshot({
  activeRelayIds,
  channelFilterStates,
  people,
  channelMatchMode,
}: BuildFilterSnapshotParams): FilterSnapshot {
  const relayIds = Array.from(activeRelayIds).sort();
  const channelStates: Record<string, "included" | "excluded"> = {};

  for (const [channelId, filterState] of channelFilterStates.entries()) {
    if (filterState === "included" || filterState === "excluded") {
      channelStates[channelId] = filterState;
    }
  }

  const selectedPeopleIds = people
    .filter((person) => person.isSelected)
    .map((person) => person.id)
    .sort();

  return {
    relayIds,
    channelStates,
    selectedPeopleIds,
    channelMatchMode,
  };
}

export function areFilterSnapshotsEqual(left: FilterSnapshot, right: FilterSnapshot): boolean {
  if (left.channelMatchMode !== right.channelMatchMode) return false;
  if (left.relayIds.length !== right.relayIds.length) return false;
  if (left.selectedPeopleIds.length !== right.selectedPeopleIds.length) return false;

  for (let i = 0; i < left.relayIds.length; i += 1) {
    if (left.relayIds[i] !== right.relayIds[i]) return false;
  }

  for (let i = 0; i < left.selectedPeopleIds.length; i += 1) {
    if (left.selectedPeopleIds[i] !== right.selectedPeopleIds[i]) return false;
  }

  const leftChannels = Object.entries(left.channelStates).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const rightChannels = Object.entries(right.channelStates).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  if (leftChannels.length !== rightChannels.length) return false;

  for (let i = 0; i < leftChannels.length; i += 1) {
    const [leftChannelId, leftChannelState] = leftChannels[i];
    const [rightChannelId, rightChannelState] = rightChannels[i];
    if (leftChannelId !== rightChannelId || leftChannelState !== rightChannelState) {
      return false;
    }
  }

  return true;
}
