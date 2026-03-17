import type { Channel, ChannelMatchMode } from "@/types";
import { z } from "zod";
import {
  DEFAULT_CHANNEL_MATCH_MODE,
  isPersistedChannelFilterState,
} from "@/domain/preferences/filter-state";
import {
  ACTIVE_RELAYS_STORAGE_KEY,
  CHANNEL_FILTERS_STORAGE_KEY,
  CHANNEL_MATCH_MODE_STORAGE_KEY,
} from "@/infrastructure/preferences/storage-registry";

type PersistedChannelFilters = Record<string, Channel["filterState"]>;
const relayIdsSchema = z.array(z.string());
const persistedChannelFiltersSchema = z.record(z.string(), z.unknown());
const channelMatchModeSchema = z.enum(["and", "or"]);

export function loadPersistedRelayIds(defaultRelayIds: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(ACTIVE_RELAYS_STORAGE_KEY);
    if (!raw) {
      return new Set(defaultRelayIds);
    }

    const parsed = relayIdsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return new Set(defaultRelayIds);
    }

    return new Set(parsed.data);
  } catch {
    return new Set(defaultRelayIds);
  }
}

export function savePersistedRelayIds(relayIds: Set<string>): void {
  try {
    localStorage.setItem(ACTIVE_RELAYS_STORAGE_KEY, JSON.stringify(Array.from(relayIds)));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}

export function loadPersistedChannelFilters(): Map<string, Channel["filterState"]> {
  try {
    const raw = localStorage.getItem(CHANNEL_FILTERS_STORAGE_KEY);
    if (!raw) {
      return new Map();
    }

    const parsed = persistedChannelFiltersSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return new Map();
    }

    const result = new Map<string, Channel["filterState"]>();
    Object.entries(parsed.data).forEach(([channelId, state]) => {
      if (isPersistedChannelFilterState(state)) {
        result.set(channelId, state);
      }
    });

    return result;
  } catch {
    return new Map();
  }
}

export function savePersistedChannelFilters(
  filters: Map<string, Channel["filterState"]>
): void {
  try {
    const persisted: PersistedChannelFilters = {};
    filters.forEach((state, channelId) => {
      if (isPersistedChannelFilterState(state)) {
        persisted[channelId] = state;
      }
    });
    localStorage.setItem(CHANNEL_FILTERS_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}

export function loadPersistedChannelMatchMode(): ChannelMatchMode {
  try {
    const raw = localStorage.getItem(CHANNEL_MATCH_MODE_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHANNEL_MATCH_MODE;
    }

    const parsed = channelMatchModeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return DEFAULT_CHANNEL_MATCH_MODE;
    }

    return parsed.data;
  } catch {
    return DEFAULT_CHANNEL_MATCH_MODE;
  }
}

export function savePersistedChannelMatchMode(mode: ChannelMatchMode): void {
  try {
    localStorage.setItem(CHANNEL_MATCH_MODE_STORAGE_KEY, JSON.stringify(mode));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}
