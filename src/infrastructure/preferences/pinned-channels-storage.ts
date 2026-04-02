import { z } from "zod";
import {
  createEmptyPinnedChannelsState,
  type PinnedChannelEntry,
  type PinnedChannelsState,
} from "@/domain/preferences/pinned-channel-state";

const PINNED_CHANNELS_NAMESPACE = "pinned-channels";

const v3EntrySchema = z.object({
  channelId: z.string(),
  pinnedAt: z.string(),
  order: z.number().finite(),
});

const v3StateSchema = z.object({
  version: z.literal(3),
  updatedAt: z.string(),
  byRelay: z.record(z.string(), z.array(v3EntrySchema).optional()),
});

const v2StateSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string(),
  byView: z.record(
    z.string(),
    z.record(z.string(), z.array(v3EntrySchema).optional()).optional()
  ),
});

function storageKey(pubkey?: string): string {
  const prefix = pubkey ? pubkey.slice(0, 8) : "guest";
  return `nodex.${PINNED_CHANNELS_NAMESPACE}.${prefix}.v3`;
}

function legacyStorageKey(pubkey?: string): string {
  const prefix = pubkey ? pubkey.slice(0, 8) : "guest";
  return `nodex.${PINNED_CHANNELS_NAMESPACE}.${prefix}.v2`;
}

function stripInvalidEntries(rawByRelay: Record<string, PinnedChannelEntry[] | undefined>) {
  const byRelay: PinnedChannelsState["byRelay"] = {};
  for (const [relayId, entries] of Object.entries(rawByRelay)) {
    if (!entries) continue;
    const valid = entries.filter((entry) => entry.channelId.trim() !== "");
    if (valid.length > 0) {
      byRelay[relayId] = valid;
    }
  }
  return byRelay;
}

function migrateLegacyState(rawLegacyState: z.infer<typeof v2StateSchema>): PinnedChannelsState {
  const byRelay = new Map<string, Map<string, PinnedChannelEntry>>();

  for (const byRelayEntries of Object.values(rawLegacyState.byView)) {
    if (!byRelayEntries) continue;
    for (const [relayId, entries] of Object.entries(byRelayEntries)) {
      if (!entries) continue;
      let relayMap = byRelay.get(relayId);
      if (!relayMap) {
        relayMap = new Map<string, PinnedChannelEntry>();
        byRelay.set(relayId, relayMap);
      }
      for (const entry of entries) {
        const channelId = entry.channelId.trim();
        if (!channelId) continue;
        const existing = relayMap.get(channelId);
        if (!existing || entry.order < existing.order) {
          relayMap.set(channelId, { ...entry, channelId });
        }
      }
    }
  }

  return {
    version: 3,
    updatedAt: rawLegacyState.updatedAt,
    byRelay: Object.fromEntries(
      Array.from(byRelay.entries()).map(([relayId, entries]) => [
        relayId,
        Array.from(entries.values()).sort((a, b) => a.order - b.order || a.channelId.localeCompare(b.channelId)),
      ])
    ),
  };
}

export function loadPinnedChannelsState(pubkey?: string): PinnedChannelsState {
  try {
    const rawV3 = localStorage.getItem(storageKey(pubkey));
    if (rawV3) {
      const parsedV3 = v3StateSchema.safeParse(JSON.parse(rawV3));
      if (!parsedV3.success) return createEmptyPinnedChannelsState();
      return {
        version: 3,
        updatedAt: parsedV3.data.updatedAt,
        byRelay: stripInvalidEntries(parsedV3.data.byRelay),
      };
    }

    const rawLegacy = localStorage.getItem(legacyStorageKey(pubkey));
    if (!rawLegacy) return createEmptyPinnedChannelsState();
    const parsedLegacy = v2StateSchema.safeParse(JSON.parse(rawLegacy));
    if (!parsedLegacy.success) return createEmptyPinnedChannelsState();
    return migrateLegacyState(parsedLegacy.data);
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
