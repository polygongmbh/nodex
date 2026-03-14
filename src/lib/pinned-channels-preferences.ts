import { z } from "zod";

export interface ViewPinnedEntry {
  channelId: string;
  pinnedAt: string;
  order: number;
}

export interface PinnedChannelsState {
  version: 2;
  updatedAt: string;
  // byView[viewType][relayId] = entries
  byView: Partial<Record<string, Partial<Record<string, ViewPinnedEntry[]>>>>;
}

const viewPinnedEntrySchema = z.object({
  channelId: z.string(),
  pinnedAt: z.string(),
  order: z.number().finite(),
});

const pinnedChannelsStateSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string(),
  byView: z.record(
    z.string(),
    z.record(z.string(), z.array(viewPinnedEntrySchema).optional()).optional()
  ),
});

function storageKey(pubkey?: string): string {
  const prefix = pubkey ? pubkey.slice(0, 8) : "guest";
  return `nodex.pinned-channels.${prefix}.v2`;
}

function emptyState(): PinnedChannelsState {
  return { version: 2, updatedAt: "", byView: {} };
}

export function loadPinnedChannelsState(pubkey?: string): PinnedChannelsState {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return emptyState();
    const parsed = pinnedChannelsStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptyState();
    // Strip entries with empty channelId
    const byView: PinnedChannelsState["byView"] = {};
    for (const [view, byRelay] of Object.entries(parsed.data.byView)) {
      if (!byRelay) continue;
      const cleanedByRelay: Partial<Record<string, ViewPinnedEntry[]>> = {};
      for (const [relayId, entries] of Object.entries(byRelay)) {
        if (!entries) continue;
        const valid = entries.filter((e) => e.channelId.trim() !== "");
        if (valid.length > 0) cleanedByRelay[relayId] = valid;
      }
      if (Object.keys(cleanedByRelay).length > 0) byView[view] = cleanedByRelay;
    }
    return { version: 2, updatedAt: parsed.data.updatedAt, byView };
  } catch {
    return emptyState();
  }
}

export function savePinnedChannelsState(state: PinnedChannelsState, pubkey?: string): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}

/**
 * Returns the union of pinned channel IDs across all given relay IDs for a view.
 * Ordered by the lowest `order` value seen for each channel across all relay buckets,
 * with ties broken alphabetically by channel ID.
 */
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

/**
 * Returns true if the channel is pinned on at least one of the given relay IDs for the view.
 */
export function isChannelPinnedForAnyRelay(
  state: PinnedChannelsState,
  view: string,
  relayIds: string[],
  channelId: string
): boolean {
  return relayIds.some((relayId) =>
    (state.byView[view]?.[relayId] ?? []).some((e) => e.channelId === channelId)
  );
}

/**
 * Pins a channel for each of the given relay IDs on the given view.
 * Idempotent per relay — skips relays that already have the channel pinned.
 */
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
    if (entries.some((e) => e.channelId === channelId)) continue;
    const maxOrder = entries.length > 0 ? Math.max(...entries.map((e) => e.order)) : -1;
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

/**
 * Unpins a channel from all of the given relay IDs on the given view.
 */
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
    if (!entries.some((e) => e.channelId === channelId)) continue;
    next = {
      ...next,
      updatedAt: now,
      byView: {
        ...next.byView,
        [view]: {
          ...next.byView[view],
          [relayId]: entries.filter((e) => e.channelId !== channelId),
        },
      },
    };
  }
  return next;
}
