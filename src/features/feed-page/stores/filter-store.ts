import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";
import { z } from "zod";
import type { Channel, ChannelMatchMode } from "@/types";
import {
  ACTIVE_RELAYS_STORAGE_KEY,
  CHANNEL_FILTERS_STORAGE_KEY,
  CHANNEL_MATCH_MODE_STORAGE_KEY,
} from "@/infrastructure/preferences/storage-registry";
import {
  DEFAULT_CHANNEL_MATCH_MODE,
  isPersistedChannelFilterState,
} from "@/domain/preferences/filter-state";

const relayIdsSchema = z.array(z.string());
const channelFiltersSchema = z.record(z.string(), z.unknown());
const channelMatchModeSchema = z.enum(["and", "or"]);

type PersistedFilterState = {
  activeRelayIds: string[];
  channelFilterStates: Record<string, string>;
  channelMatchMode: string;
};

const tryParseJson = (raw: string | null, fallback: unknown) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const filterStorage: PersistStorage<PersistedFilterState> = {
  getItem: (): StorageValue<PersistedFilterState> | null => {
    const relayRaw = localStorage.getItem(ACTIVE_RELAYS_STORAGE_KEY);
    const channelRaw = localStorage.getItem(CHANNEL_FILTERS_STORAGE_KEY);
    const matchModeRaw = localStorage.getItem(CHANNEL_MATCH_MODE_STORAGE_KEY);
    if (!relayRaw && !channelRaw && !matchModeRaw) return null;
    return {
      state: {
        activeRelayIds: tryParseJson(relayRaw, []) as string[],
        channelFilterStates: tryParseJson(channelRaw, {}) as Record<string, string>,
        channelMatchMode: tryParseJson(matchModeRaw, DEFAULT_CHANNEL_MATCH_MODE) as string,
      },
      version: 0,
    };
  },
  setItem: (_name: string, value: StorageValue<PersistedFilterState>): void => {
    try {
      localStorage.setItem(ACTIVE_RELAYS_STORAGE_KEY, JSON.stringify(value.state.activeRelayIds));
      localStorage.setItem(CHANNEL_FILTERS_STORAGE_KEY, JSON.stringify(value.state.channelFilterStates));
      localStorage.setItem(CHANNEL_MATCH_MODE_STORAGE_KEY, JSON.stringify(value.state.channelMatchMode));
    } catch {
      // Ignore storage failures
    }
  },
  removeItem: (): void => {
    localStorage.removeItem(ACTIVE_RELAYS_STORAGE_KEY);
    localStorage.removeItem(CHANNEL_FILTERS_STORAGE_KEY);
    localStorage.removeItem(CHANNEL_MATCH_MODE_STORAGE_KEY);
  },
};

type SetStateUpdater<T> = T | ((prev: T) => T);

interface FilterStoreState {
  activeRelayIds: Set<string>;
  channelFilterStates: Map<string, Channel["filterState"]>;
  channelMatchMode: ChannelMatchMode;

  setActiveRelayIds: (updater: SetStateUpdater<Set<string>>) => void;
  setChannelFilterStates: (updater: SetStateUpdater<Map<string, Channel["filterState"]>>) => void;
  setChannelMatchMode: (mode: ChannelMatchMode) => void;
}

export const useFilterStore = create<FilterStoreState>()(
  persist(
    (set) => ({
      activeRelayIds: new Set<string>(),
      channelFilterStates: new Map<string, Channel["filterState"]>(),
      channelMatchMode: DEFAULT_CHANNEL_MATCH_MODE,

      setActiveRelayIds: (updater) =>
        set((state) => ({
          activeRelayIds:
            typeof updater === "function" ? updater(state.activeRelayIds) : updater,
        })),

      setChannelFilterStates: (updater) =>
        set((state) => ({
          channelFilterStates:
            typeof updater === "function" ? updater(state.channelFilterStates) : updater,
        })),

      setChannelMatchMode: (mode) => set({ channelMatchMode: mode }),
    }),
    {
      name: "filter-store",
      storage: filterStorage,
      partialize: (state) => ({
        activeRelayIds: Array.from(state.activeRelayIds),
        channelFilterStates: Object.fromEntries(
          Array.from(state.channelFilterStates.entries()).filter(([, v]) =>
            isPersistedChannelFilterState(v)
          )
        ),
        channelMatchMode: state.channelMatchMode,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Record<string, unknown> | undefined;
        if (!stored) return current;

        const relayIds = relayIdsSchema.safeParse(stored.activeRelayIds);
        const channelFilters = channelFiltersSchema.safeParse(stored.channelFilterStates);
        const matchMode = channelMatchModeSchema.safeParse(stored.channelMatchMode);

        const activeRelayIds = relayIds.success
          ? new Set(relayIds.data)
          : new Set<string>();

        const channelFilterStates = new Map<string, Channel["filterState"]>();
        if (channelFilters.success) {
          for (const [id, state] of Object.entries(channelFilters.data)) {
            if (isPersistedChannelFilterState(state)) {
              channelFilterStates.set(id, state);
            }
          }
        }

        return {
          ...current,
          activeRelayIds,
          channelFilterStates,
          channelMatchMode: matchMode.success ? matchMode.data : DEFAULT_CHANNEL_MATCH_MODE,
        };
      },
    }
  )
);
