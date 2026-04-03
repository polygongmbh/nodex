import type { QuickFilterState } from "@/types";

export function makeQuickFilterState(overrides: Partial<QuickFilterState> = {}): QuickFilterState {
  return {
    recentEnabled: false,
    recentDays: 7,
    priorityEnabled: false,
    minPriority: 50,
    ...overrides,
  };
}
