import type { FilterSnapshot } from "@/domain/content/filter-snapshot";
import type { QuickFilterState } from "@/types";

export function makeFilterSnapshot(overrides: Partial<FilterSnapshot> = {}): FilterSnapshot {
  return {
    relayIds: [],
    channelStates: {},
    selectedPeopleIds: [],
    channelMatchMode: "and",
    quickFilters: {
      recentEnabled: false,
      recentDays: 7,
      priorityEnabled: false,
      minPriority: 50,
    },
    ...overrides,
  };
}

export function makeQuickFilters(overrides: Partial<QuickFilterState> = {}): QuickFilterState {
  return {
    recentEnabled: false,
    recentDays: 7,
    priorityEnabled: false,
    minPriority: 50,
    ...overrides,
  };
}
