import { Channel } from "@/types";

const ACTIVE_RELAYS_STORAGE_KEY = "nodex.active-relays.v1";
const CHANNEL_FILTERS_STORAGE_KEY = "nodex.channel-filters.v1";

type PersistedChannelFilters = Record<string, Channel["filterState"]>;

export function loadPersistedRelayIds(defaultRelayIds: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(ACTIVE_RELAYS_STORAGE_KEY);
    if (!raw) {
      return new Set(defaultRelayIds);
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      return new Set(defaultRelayIds);
    }

    return new Set(parsed);
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

export function getEffectiveActiveRelayIds(
  activeRelayIds: Set<string>,
  availableRelayIds: string[]
): Set<string> {
  const availableSet = new Set(availableRelayIds);
  return new Set(Array.from(activeRelayIds).filter((relayId) => availableSet.has(relayId)));
}

export function loadPersistedChannelFilters(): Map<string, Channel["filterState"]> {
  try {
    const raw = localStorage.getItem(CHANNEL_FILTERS_STORAGE_KEY);
    if (!raw) {
      return new Map();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map();
    }

    const result = new Map<string, Channel["filterState"]>();
    Object.entries(parsed as PersistedChannelFilters).forEach(([channelId, state]) => {
      if (state === "included" || state === "excluded") {
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
      if (state === "included" || state === "excluded") {
        persisted[channelId] = state;
      }
    });
    localStorage.setItem(CHANNEL_FILTERS_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}
