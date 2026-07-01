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
  // Pubkeys (normalized lowercase hex) of people the feed is scoped to. Binary
  // selection — there is no per-person include/exclude like channels have. Not
  // persisted: selection is URL-driven (the `p` search param), rebuilt on load.
  selectedPubkeys: Set<string>;
  searchQuery: string;

  // Relays/channels/matchMode keep the generic SetStateUpdater (React
  // setState-style) form on purpose: their mutations are pure container
  // writes whose real logic — the 3-state channel cycle, exclusive-with-undo,
  // the postedTags side effect, toasts — already lives in the command
  // controllers (use-channel-filter-controller, use-relay-*-controller). A
  // store intent action there would only wrap a trivial map/set write. The
  // updater form also gives those `useCallback`-wrapped toggles an atomic
  // read-modify-write without stale-closure risk.
  setActiveRelayIds: (updater: SetStateUpdater<Set<string>>) => void;
  setChannelFilterStates: (updater: SetStateUpdater<Map<string, Channel["filterState"]>>) => void;
  setChannelMatchMode: (updater: SetStateUpdater<ChannelMatchMode>) => void;

  // Selection, by contrast, is pure set-algebra with no controller-side
  // orchestration, so its read-modify-write lives here as intent commands
  // (no `new Set(prev)` spreads leaking into controllers); each preserves
  // identity on a no-op. `setSelectedPubkeys` is the plain bulk-replace
  // primitive for restoring a whole set from an external source (URL, saved
  // filter, snapshot).
  setSelectedPubkeys: (next: Set<string>) => void;
  selectOnlyPerson: (pubkey: string) => void;
  togglePersonSelection: (pubkey: string) => void;
  deselectPeople: (pubkeys: Iterable<string>) => void;
  retainSelectedPeople: (allowed: Iterable<string>) => void;
  clearSelectedPeople: () => void;

  setSearchQuery: (query: string) => void;
}

export const useFilterStore = create<FilterStoreState>()(
  persist(
    (set) => ({
      activeRelayIds: new Set<string>(),
      channelFilterStates: new Map<string, Channel["filterState"]>(),
      channelMatchMode: DEFAULT_CHANNEL_MATCH_MODE,
      selectedPubkeys: new Set<string>(),
      searchQuery: "",

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

      setChannelMatchMode: (updater) =>
        set((state) => ({
          channelMatchMode:
            typeof updater === "function" ? updater(state.channelMatchMode) : updater,
        })),

      setSelectedPubkeys: (next) => set({ selectedPubkeys: next }),

      selectOnlyPerson: (pubkey) =>
        set((state) => {
          const current = state.selectedPubkeys;
          if (current.size === 1 && current.has(pubkey)) return state;
          return { selectedPubkeys: new Set([pubkey]) };
        }),

      togglePersonSelection: (pubkey) =>
        set((state) => {
          const next = new Set(state.selectedPubkeys);
          if (next.has(pubkey)) next.delete(pubkey);
          else next.add(pubkey);
          return { selectedPubkeys: next };
        }),

      deselectPeople: (pubkeys) =>
        set((state) => {
          const remove = pubkeys instanceof Set ? pubkeys : new Set(pubkeys);
          let changed = false;
          const next = new Set<string>();
          for (const pubkey of state.selectedPubkeys) {
            if (remove.has(pubkey)) changed = true;
            else next.add(pubkey);
          }
          return changed ? { selectedPubkeys: next } : state;
        }),

      retainSelectedPeople: (allowed) =>
        set((state) => {
          const keep = allowed instanceof Set ? allowed : new Set(allowed);
          let changed = false;
          const next = new Set<string>();
          for (const pubkey of state.selectedPubkeys) {
            if (keep.has(pubkey)) next.add(pubkey);
            else changed = true;
          }
          return changed ? { selectedPubkeys: next } : state;
        }),

      clearSelectedPeople: () =>
        set((state) => (state.selectedPubkeys.size === 0 ? state : { selectedPubkeys: new Set() })),

      setSearchQuery: (query) => set({ searchQuery: query }),
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

/**
 * Narrow selector hook: is this pubkey currently selected? Centralizes the
 * lowercase-hex normalization so callers never have to remember it, and keeps
 * each subscribing row re-rendering only when its own selection flips.
 */
export function useIsPersonSelected(pubkey: string): boolean {
  return useFilterStore((s) => s.selectedPubkeys.has(pubkey.trim().toLowerCase()));
}
