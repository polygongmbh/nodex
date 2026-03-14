import { z } from "zod";

export interface ViewPinnedEntry {
  channelId: string;
  pinnedAt: string;
  order: number;
}

export interface PinnedChannelsState {
  version: 1;
  updatedAt: string;
  byView: Partial<Record<string, ViewPinnedEntry[]>>;
}

const viewPinnedEntrySchema = z.object({
  channelId: z.string(),
  pinnedAt: z.string(),
  order: z.number().finite(),
});

const pinnedChannelsStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  byView: z.record(z.string(), z.array(viewPinnedEntrySchema).optional()),
});

function storageKey(pubkey?: string): string {
  const prefix = pubkey ? pubkey.slice(0, 8) : "guest";
  return `nodex.pinned-channels.${prefix}.v1`;
}

function emptyState(): PinnedChannelsState {
  return { version: 1, updatedAt: "", byView: {} };
}

export function loadPinnedChannelsState(pubkey?: string): PinnedChannelsState {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return emptyState();
    const parsed = pinnedChannelsStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptyState();
    // Strip entries with empty channelId
    const byView: PinnedChannelsState["byView"] = {};
    for (const [view, entries] of Object.entries(parsed.data.byView)) {
      if (!entries) continue;
      const valid = entries.filter((e) => e.channelId.trim() !== "");
      if (valid.length > 0) byView[view] = valid;
    }
    return { version: 1, updatedAt: parsed.data.updatedAt, byView };
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

export function getPinnedChannelIdsForView(state: PinnedChannelsState, view: string): string[] {
  const entries = state.byView[view] ?? [];
  return [...entries].sort((a, b) => a.order - b.order).map((e) => e.channelId);
}

export function isChannelPinnedForView(state: PinnedChannelsState, view: string, channelId: string): boolean {
  return (state.byView[view] ?? []).some((e) => e.channelId === channelId);
}

export function pinChannelForView(
  state: PinnedChannelsState,
  view: string,
  channelId: string
): PinnedChannelsState {
  const entries = state.byView[view] ?? [];
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
    byView: { ...state.byView, [view]: [...entries, newEntry] },
  };
}

export function unpinChannelForView(
  state: PinnedChannelsState,
  view: string,
  channelId: string
): PinnedChannelsState {
  const entries = state.byView[view] ?? [];
  const filtered = entries.filter((e) => e.channelId !== channelId);
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    byView: { ...state.byView, [view]: filtered },
  };
}
