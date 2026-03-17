export interface ViewPinnedEntry {
  channelId: string;
  pinnedAt: string;
  order: number;
}

export interface PinnedChannelsState {
  version: 2;
  updatedAt: string;
  byView: Partial<Record<string, Partial<Record<string, ViewPinnedEntry[]>>>>;
}

export function createEmptyPinnedChannelsState(): PinnedChannelsState {
  return { version: 2, updatedAt: "", byView: {} };
}

export function getPinnedChannelIdsForView(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[]
): string[] {
  const minOrderById = new Map<string, number>();
  for (const relayId of relayIds) {
    for (const entry of state.byView[view]?.[relayId] ?? []) {
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
  view: string,
  relayIds: string[],
  channelId: string
): boolean {
  return relayIds.some((relayId) =>
    (state.byView[view]?.[relayId] ?? []).some((entry) => entry.channelId === channelId)
  );
}

export function pinChannelForRelays(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  let next = state;
  const now = new Date().toISOString();
  for (const relayId of relayIds) {
    const entries = next.byView[view]?.[relayId] ?? [];
    if (entries.some((entry) => entry.channelId === channelId)) continue;
    const maxOrder = entries.length > 0 ? Math.max(...entries.map((entry) => entry.order)) : -1;
    const newEntry: ViewPinnedEntry = { channelId, pinnedAt: now, order: maxOrder + 1 };
    next = {
      ...next,
      updatedAt: now,
      byView: {
        ...next.byView,
        [view]: { ...next.byView[view], [relayId]: [...entries, newEntry] },
      },
    };
  }
  return next;
}

export function unpinChannelFromRelays(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[],
  channelId: string
): PinnedChannelsState {
  let next = state;
  const now = new Date().toISOString();
  for (const relayId of relayIds) {
    const entries = next.byView[view]?.[relayId] ?? [];
    if (!entries.some((entry) => entry.channelId === channelId)) continue;
    next = {
      ...next,
      updatedAt: now,
      byView: {
        ...next.byView,
        [view]: {
          ...next.byView[view],
          [relayId]: entries.filter((entry) => entry.channelId !== channelId),
        },
      },
    };
  }
  return next;
}
