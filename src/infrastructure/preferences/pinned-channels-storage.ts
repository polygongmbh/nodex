import { z } from "zod";
import {
  createEmptyPinnedChannelsState,
  type PinnedChannelsState,
  type ViewPinnedEntry,
} from "@/domain/preferences/pinned-channel-state";

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

function stripInvalidEntries(
  rawState: PinnedChannelsState
): PinnedChannelsState["byView"] {
  const byView: PinnedChannelsState["byView"] = {};
  for (const [view, byRelay] of Object.entries(rawState.byView)) {
    if (!byRelay) continue;
    const cleanedByRelay: Partial<Record<string, ViewPinnedEntry[]>> = {};
    for (const [relayId, entries] of Object.entries(byRelay)) {
      if (!entries) continue;
      const valid = entries.filter((entry) => entry.channelId.trim() !== "");
      if (valid.length > 0) cleanedByRelay[relayId] = valid;
    }
    if (Object.keys(cleanedByRelay).length > 0) byView[view] = cleanedByRelay;
  }
  return byView;
}

export function loadPinnedChannelsState(pubkey?: string): PinnedChannelsState {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return createEmptyPinnedChannelsState();
    const parsed = pinnedChannelsStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return createEmptyPinnedChannelsState();
    const validData = parsed.data as PinnedChannelsState;
    return {
      version: 2,
      updatedAt: validData.updatedAt,
      byView: stripInvalidEntries(validData),
    };
  } catch {
    return createEmptyPinnedChannelsState();
  }
}

export function savePinnedChannelsState(state: PinnedChannelsState, pubkey?: string): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}
