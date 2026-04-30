import { useCallback, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { normalizeQuickFilterState } from "@/domain/content/quick-filter-constraints";
import { mapPeopleSelection } from "@/domain/content/filter-state-utils";
import { areFilterSnapshotsEqual, type FilterSnapshot } from "@/domain/content/filter-snapshot";
import { useSavedFilterStore } from "@/features/feed-page/stores/saved-filter-store";
import type {   Channel, ChannelMatchMode, QuickFilterState, Relay, SavedFilterConfiguration, SavedFilterController } from "@/types";
import type { SelectablePerson } from "@/types/person";

interface UseSavedFilterConfigsOptions {
  currentFilterSnapshot: FilterSnapshot;
  relays: Relay[];
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  setChannelFilterStates: Dispatch<SetStateAction<Map<string, Channel["filterState"]>>>;
  setChannelMatchMode: Dispatch<SetStateAction<ChannelMatchMode>>;
  setPeople: Dispatch<SetStateAction<SelectablePerson[]>>;
  setQuickFilters: Dispatch<SetStateAction<QuickFilterState>>;
  resetFiltersToDefault: () => void;
}

export function useSavedFilterConfigs({
  currentFilterSnapshot,
  relays,
  setActiveRelayIds,
  setChannelFilterStates,
  setChannelMatchMode,
  setPeople,
  setQuickFilters,
  resetFiltersToDefault,
}: UseSavedFilterConfigsOptions) {
  const configurations = useSavedFilterStore((s) => s.configurations);
  const activeConfigurationId = useSavedFilterStore((s) => s.activeConfigurationId);
  const addConfiguration = useSavedFilterStore((s) => s.addConfiguration);
  const setActiveConfigurationId = useSavedFilterStore((s) => s.setActiveConfigurationId);
  const renameConfiguration = useSavedFilterStore((s) => s.renameConfiguration);
  const deleteConfiguration = useSavedFilterStore((s) => s.deleteConfiguration);

  const activeSavedConfiguration = useMemo(
    () => configurations.find((c) => c.id === activeConfigurationId) || null,
    [activeConfigurationId, configurations]
  );

  const createSnapshotFromConfiguration = useCallback(
    (configuration: SavedFilterConfiguration): FilterSnapshot => ({
      relayIds: [...configuration.relayIds].sort(),
      channelStates: configuration.channelStates,
      selectedPeopleIds: [...configuration.selectedPeopleIds].sort(),
      channelMatchMode: configuration.channelMatchMode,
      quickFilters: normalizeQuickFilterState(configuration.quickFilters),
    }),
    []
  );

  useEffect(() => {
    if (!activeSavedConfiguration) return;
    const activeSnapshot = createSnapshotFromConfiguration(activeSavedConfiguration);
    if (areFilterSnapshotsEqual(activeSnapshot, currentFilterSnapshot)) return;
    if (activeConfigurationId) {
      setActiveConfigurationId(null);
    }
  }, [activeSavedConfiguration, createSnapshotFromConfiguration, currentFilterSnapshot, activeConfigurationId, setActiveConfigurationId]);

  const handleSaveCurrentFilterConfiguration = useCallback((name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;

    const nowIso = new Date().toISOString();
    const configurationId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `saved-filter-${Date.now()}`;
    const configuration: SavedFilterConfiguration = {
      id: configurationId,
      name: normalizedName,
      relayIds: currentFilterSnapshot.relayIds,
      channelStates: currentFilterSnapshot.channelStates,
      selectedPeopleIds: currentFilterSnapshot.selectedPeopleIds,
      channelMatchMode: currentFilterSnapshot.channelMatchMode,
      quickFilters: normalizeQuickFilterState(currentFilterSnapshot.quickFilters),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    addConfiguration(configuration);
  }, [currentFilterSnapshot, addConfiguration]);

  const handleApplySavedFilterConfiguration = useCallback((configurationId: string) => {
    const configuration = configurations.find((c) => c.id === configurationId) || null;
    if (!configuration) return;

    if (activeConfigurationId === configurationId) {
      resetFiltersToDefault();
      setActiveConfigurationId(null);
      return;
    }

    const availableRelayIds = new Set(relays.map((relay) => relay.id));
    const nextRelayIds = new Set(
      configuration.relayIds.filter((relayId) => availableRelayIds.has(relayId))
    );
    setActiveRelayIds(nextRelayIds);

    const nextChannelStates = new Map<string, Channel["filterState"]>();
    for (const [channelId, state] of Object.entries(configuration.channelStates)) {
      if (state === "included" || state === "excluded") {
        nextChannelStates.set(channelId, state);
      }
    }
    setChannelFilterStates(nextChannelStates);
    setChannelMatchMode(configuration.channelMatchMode);

    const selectedPeopleIdSet = new Set(configuration.selectedPeopleIds);
    setPeople((previous) => mapPeopleSelection(previous, (person) => selectedPeopleIdSet.has(person.pubkey)));
    setQuickFilters(normalizeQuickFilterState(configuration.quickFilters));

    setActiveConfigurationId(configurationId);
  }, [
    relays,
    resetFiltersToDefault,
    configurations,
    activeConfigurationId,
    setActiveConfigurationId,
    setActiveRelayIds,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
    setQuickFilters,
  ]);

  const handleRenameSavedFilterConfiguration = useCallback((configurationId: string, nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;
    renameConfiguration(configurationId, normalizedName);
  }, [renameConfiguration]);

  const handleDeleteSavedFilterConfiguration = useCallback((configurationId: string) => {
    deleteConfiguration(configurationId);
  }, [deleteConfiguration]);

  const savedFilterController = useMemo<SavedFilterController>(
    () => ({
      configurations,
      activeConfigurationId,
      onApplyConfiguration: handleApplySavedFilterConfiguration,
      onSaveCurrentConfiguration: handleSaveCurrentFilterConfiguration,
      onRenameConfiguration: handleRenameSavedFilterConfiguration,
      onDeleteConfiguration: handleDeleteSavedFilterConfiguration,
    }),
    [
      handleApplySavedFilterConfiguration,
      handleDeleteSavedFilterConfiguration,
      handleRenameSavedFilterConfiguration,
      handleSaveCurrentFilterConfiguration,
      activeConfigurationId,
      configurations,
    ]
  );

  return {
    savedFilterController,
  };
}
