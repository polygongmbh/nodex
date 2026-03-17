import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { loadSavedFilterState, saveSavedFilterState } from "@/lib/saved-filter-configurations";
import { mapPeopleSelection } from "@/lib/filter-state-utils";
import { areFilterSnapshotsEqual, type FilterSnapshot } from "@/lib/filter-snapshot";
import type {
  Channel,
  ChannelMatchMode,
  Person,
  Relay,
  SavedFilterConfiguration,
  SavedFilterController,
  SavedFilterState,
} from "@/types";

interface UseSavedFilterConfigsOptions {
  currentFilterSnapshot: FilterSnapshot;
  relays: Relay[];
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  setChannelFilterStates: Dispatch<SetStateAction<Map<string, Channel["filterState"]>>>;
  setChannelMatchMode: Dispatch<SetStateAction<ChannelMatchMode>>;
  setPeople: Dispatch<SetStateAction<Person[]>>;
  resetFiltersToDefault: () => void;
}

export function useSavedFilterConfigs({
  currentFilterSnapshot,
  relays,
  setActiveRelayIds,
  setChannelFilterStates,
  setChannelMatchMode,
  setPeople,
  resetFiltersToDefault,
}: UseSavedFilterConfigsOptions) {
  const [savedFilterState, setSavedFilterState] = useState<SavedFilterState>(() => loadSavedFilterState());

  useEffect(() => {
    saveSavedFilterState(savedFilterState);
  }, [savedFilterState]);

  const activeSavedConfiguration = useMemo(
    () =>
      savedFilterState.configurations.find(
        (configuration) => configuration.id === savedFilterState.activeConfigurationId
      ) || null,
    [savedFilterState.activeConfigurationId, savedFilterState.configurations]
  );

  const createSnapshotFromConfiguration = useCallback(
    (configuration: SavedFilterConfiguration): FilterSnapshot => ({
      relayIds: [...configuration.relayIds].sort(),
      channelStates: configuration.channelStates,
      selectedPeopleIds: [...configuration.selectedPeopleIds].sort(),
      channelMatchMode: configuration.channelMatchMode,
    }),
    []
  );

  useEffect(() => {
    if (!activeSavedConfiguration) return;
    const activeSnapshot = createSnapshotFromConfiguration(activeSavedConfiguration);
    if (areFilterSnapshotsEqual(activeSnapshot, currentFilterSnapshot)) return;
    setSavedFilterState((previous) => {
      if (!previous.activeConfigurationId) return previous;
      return {
        ...previous,
        activeConfigurationId: null,
      };
    });
  }, [activeSavedConfiguration, createSnapshotFromConfiguration, currentFilterSnapshot]);

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
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setSavedFilterState((previous) => ({
      activeConfigurationId: configurationId,
      configurations: [...previous.configurations, configuration],
    }));
  }, [currentFilterSnapshot]);

  const handleApplySavedFilterConfiguration = useCallback((configurationId: string) => {
    const configuration = savedFilterState.configurations.find((item) => item.id === configurationId);
    if (!configuration) return;

    if (savedFilterState.activeConfigurationId === configurationId) {
      resetFiltersToDefault();
      setSavedFilterState((previous) => ({
        ...previous,
        activeConfigurationId: null,
      }));
      return;
    }

    const availableRelayIds = new Set(relays.map((relay) => relay.id));
    const nextRelayIds = new Set(
      configuration.relayIds.filter((relayId) => availableRelayIds.has(relayId))
    );
    setActiveRelayIds(nextRelayIds.size > 0 ? nextRelayIds : new Set(relays.map((relay) => relay.id)));

    const nextChannelStates = new Map<string, Channel["filterState"]>();
    for (const [channelId, state] of Object.entries(configuration.channelStates)) {
      if (state === "included" || state === "excluded") {
        nextChannelStates.set(channelId, state);
      }
    }
    setChannelFilterStates(nextChannelStates);
    setChannelMatchMode(configuration.channelMatchMode);

    const selectedPeopleIdSet = new Set(configuration.selectedPeopleIds);
    setPeople((previous) => mapPeopleSelection(previous, (person) => selectedPeopleIdSet.has(person.id)));

    setSavedFilterState((previous) => ({
      ...previous,
      activeConfigurationId: configurationId,
    }));
  }, [
    relays,
    resetFiltersToDefault,
    savedFilterState.activeConfigurationId,
    savedFilterState.configurations,
    setActiveRelayIds,
    setChannelFilterStates,
    setChannelMatchMode,
    setPeople,
  ]);

  const handleRenameSavedFilterConfiguration = useCallback((configurationId: string, nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;
    setSavedFilterState((previous) => ({
      ...previous,
      configurations: previous.configurations.map((configuration) =>
        configuration.id === configurationId
          ? {
              ...configuration,
              name: normalizedName,
              updatedAt: new Date().toISOString(),
            }
          : configuration
      ),
    }));
  }, []);

  const handleDeleteSavedFilterConfiguration = useCallback((configurationId: string) => {
    setSavedFilterState((previous) => ({
      activeConfigurationId:
        previous.activeConfigurationId === configurationId ? null : previous.activeConfigurationId,
      configurations: previous.configurations.filter((configuration) => configuration.id !== configurationId),
    }));
  }, []);

  const savedFilterController = useMemo<SavedFilterController>(
    () => ({
      configurations: savedFilterState.configurations,
      activeConfigurationId: savedFilterState.activeConfigurationId,
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
      savedFilterState.activeConfigurationId,
      savedFilterState.configurations,
    ]
  );

  return {
    savedFilterState,
    savedFilterController,
  };
}
