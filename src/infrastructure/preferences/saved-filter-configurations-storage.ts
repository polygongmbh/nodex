import { z } from "zod";
import type { SavedFilterConfiguration, SavedFilterState } from "@/types";
import {
  EMPTY_SAVED_FILTER_STATE,
  normalizeSavedFilterState,
} from "@/domain/preferences/saved-filter-state";
import { SAVED_FILTER_CONFIGS_STORAGE_KEY as SAVED_FILTER_CONFIGURATIONS_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

const savedFilterConfigurationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  relayIds: z.array(z.string()),
  channelStates: z.record(z.string(), z.enum(["included", "excluded"])),
  selectedPeopleIds: z.array(z.string()),
  channelMatchMode: z.enum(["and", "or"]),
  quickFilters: z
    .object({
      recentEnabled: z.boolean(),
      recentDays: z.number(),
      priorityEnabled: z.boolean(),
      minPriority: z.number(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const savedFilterStateSchema = z.object({
  activeConfigurationId: z.string().nullable(),
  configurations: z.array(savedFilterConfigurationSchema),
});

export function loadSavedFilterState(): SavedFilterState {
  try {
    const raw = localStorage.getItem(SAVED_FILTER_CONFIGURATIONS_STORAGE_KEY);
    if (!raw) return EMPTY_SAVED_FILTER_STATE;
    const parsed = savedFilterStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return EMPTY_SAVED_FILTER_STATE;

    return normalizeSavedFilterState({
      activeConfigurationId: parsed.data.activeConfigurationId,
      configurations: parsed.data.configurations as SavedFilterConfiguration[],
    });
  } catch {
    return EMPTY_SAVED_FILTER_STATE;
  }
}

export function saveSavedFilterState(state: SavedFilterState): void {
  try {
    localStorage.setItem(SAVED_FILTER_CONFIGURATIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}
