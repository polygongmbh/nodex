import { z } from "zod";

export interface ViewPinnedEntry {
  channelId: string;
  pinnedAt: string;
  order: number;
}

export interface PinnedChannelsState {
  version: 2;
  updatedAt: string;
  // byView[viewType][relaySetKey] = entries
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

/** Stable key representing the active relay set — sorted relay IDs joined by "+". */
export function deriveRelaySetKey(relayIds: Iterable<string>): string {
  return Array.from(relayIds).sort().join("+") || "_";
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
      for (const [relayKey, entries] of Object.entries(byRelay)) {
        if (!entries) continue;
        const valid = entries.filter((e) => e.channelId.trim() !== "");
        if (valid.length > 0) cleanedByRelay[relayKey] = valid;
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

export function getPinnedChannelIdsForView(
  state: PinnedChannelsState,
  view: string,
  relaySetKey: string
): string[] {
  const entries = state.byView[view]?.[relaySetKey] ?? [];
  return [...entries].sort((a, b) => a.order - b.order).map((e) => e.channelId);
}

export function isChannelPinnedForView(
  state: PinnedChannelsState,
  view: string,
  relaySetKey: string,
  channelId: string
): boolean {
  return (state.byView[view]?.[relaySetKey] ?? []).some((e) => e.channelId === channelId);
}

export function pinChannelForView(
  state: PinnedChannelsState,
  view: string,
  relaySetKey: string,
  channelId: string
): PinnedChannelsState {
  const entries = state.byView[view]?.[relaySetKey] ?? [];
  if (entries.some((e) => e.channelId === channelId)) return state;
  const maxOrder = entries.length > 0 ? Math.max(...entries.map((e) => e.order)) : -1;
  const newEntry: ViewPinnedEntry = {
    channelId,
    pinnedAt: new Date().toISOString(),
    order: maxOrder + 1,
  };
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    byView: {
      ...state.byView,
      [view]: { ...state.byView[view], [relaySetKey]: [...entries, newEntry] },
    },
  };
}

export function unpinChannelForView(
  state: PinnedChannelsState,
  view: string,
  relaySetKey: string,
  channelId: string
): PinnedChannelsState {
  const entries = state.byView[view]?.[relaySetKey] ?? [];
  const filtered = entries.filter((e) => e.channelId !== channelId);
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    byView: {
      ...state.byView,
      [view]: { ...state.byView[view], [relaySetKey]: filtered },
    },
  };
}
