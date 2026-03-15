import { z } from "zod";
import type { SavedFilterConfiguration, SavedFilterState } from "@/types";
import { STORAGE_KEY_SAVED_FILTER_CONFIGS as SAVED_FILTER_CONFIGURATIONS_STORAGE_KEY } from "./storage-registry";

const savedFilterConfigurationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  relayIds: z.array(z.string()),
  channelStates: z.record(z.string(), z.enum(["included", "excluded"])),
  selectedPeopleIds: z.array(z.string()),
  channelMatchMode: z.enum(["and", "or"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const savedFilterStateSchema = z.object({
  activeConfigurationId: z.string().nullable(),
  configurations: z.array(savedFilterConfigurationSchema),
});

const EMPTY_STATE: SavedFilterState = {
  activeConfigurationId: null,
  configurations: [],
};

export function loadSavedFilterState(): SavedFilterState {
  try {
    const raw = localStorage.getItem(SAVED_FILTER_CONFIGURATIONS_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = savedFilterStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return EMPTY_STATE;

    const existingIds = new Set(parsed.data.configurations.map((configuration) => configuration.id));
    const activeConfigurationId = parsed.data.activeConfigurationId;
    return {
      activeConfigurationId:
        activeConfigurationId && existingIds.has(activeConfigurationId)
          ? activeConfigurationId
          : null,
      configurations: parsed.data.configurations as SavedFilterConfiguration[],
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveSavedFilterState(state: SavedFilterState): void {
  try {
    localStorage.setItem(SAVED_FILTER_CONFIGURATIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}
