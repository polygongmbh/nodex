import type { SavedFilterConfiguration, SavedFilterState } from "@/types";

export const EMPTY_SAVED_FILTER_STATE: SavedFilterState = {
  activeConfigurationId: null,
  configurations: [],
};

export function normalizeSavedFilterState(state: SavedFilterState): SavedFilterState {
  const existingIds = new Set(state.configurations.map((configuration) => configuration.id));
  const activeConfigurationId = state.activeConfigurationId;

  return {
    activeConfigurationId:
      activeConfigurationId && existingIds.has(activeConfigurationId)
        ? activeConfigurationId
        : null,
    configurations: state.configurations,
  };
}

export function findSavedFilterConfiguration(
  state: SavedFilterState,
  configurationId: string
): SavedFilterConfiguration | null {
  return state.configurations.find((configuration) => configuration.id === configurationId) || null;
}
