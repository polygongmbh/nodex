import type { FilterSnapshot } from "@/domain/content/filter-snapshot";
import type { Person, QuickFilterState } from "@/types";

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

export function selectPeople(people: Person[], selectedIds: string[]): Person[] {
  const selectedIdSet = new Set(selectedIds);
  return people.map((person) => ({
    ...person,
    isSelected: selectedIdSet.has(person.id),
  }));
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
