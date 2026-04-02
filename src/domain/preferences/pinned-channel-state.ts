export interface PinnedChannelEntry {
  channelId: string;
  pinnedAt: string;
  order: number;
}

export interface PinnedChannelsState {
  version: 3;
  updatedAt: string;
  byRelay: Partial<Record<string, PinnedChannelEntry[]>>;
}

export function createEmptyPinnedChannelsState(): PinnedChannelsState {
  return { version: 3, updatedAt: "", byRelay: {} };
}

export function getPinnedChannelIdsForRelays(
  state: PinnedChannelsState,
  relayIds: string[]
): string[] {
  const minOrderById = new Map<string, number>();
  for (const relayId of relayIds) {
    for (const entry of state.byRelay[relayId] ?? []) {
      const current = minOrderById.get(entry.channelId);
      if (current === undefined || entry.order < current) {
        minOrderById.set(entry.channelId, entry.order);
      }
    }
  }
  return Array.from(minOrderById.entries())
    .sort(([idA, orderA], [idB, orderB]) => orderA - orderB || idA.localeCompare(idB))
    .map(([id]) => id);
}

export function isChannelPinnedForAnyRelay(
  state: PinnedChannelsState,
  relayIds: string[],
  channelId: string
): boolean {
  return relayIds.some((relayId) =>
    (state.byRelay[relayId] ?? []).some((entry) => entry.channelId === channelId)
  );
}

export function pinChannelForRelays(
  state: PinnedChannelsState,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  let next = state;
  const now = new Date().toISOString();
  for (const relayId of relayIds) {
    const entries = next.byRelay[relayId] ?? [];
    if (entries.some((entry) => entry.channelId === channelId)) continue;
    const maxOrder = entries.length > 0 ? Math.max(...entries.map((entry) => entry.order)) : -1;
    const newEntry: PinnedChannelEntry = { channelId, pinnedAt: now, order: maxOrder + 1 };
    next = {
      ...next,
      updatedAt: now,
      byRelay: {
        ...next.byRelay,
        [relayId]: [...entries, newEntry],
      },
    };
  }
  return next;
}

export function unpinChannelFromRelays(
  state: PinnedChannelsState,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  let next = state;
  const now = new Date().toISOString();
  for (const relayId of relayIds) {
    const entries = next.byRelay[relayId] ?? [];
    if (!entries.some((entry) => entry.channelId === channelId)) continue;
    next = {
      ...next,
      updatedAt: now,
      byRelay: {
        ...next.byRelay,
        [relayId]: entries.filter((entry) => entry.channelId !== channelId),
      },
    };
  }
  return next;
}
