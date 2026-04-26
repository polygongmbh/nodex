import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getPreferredMentionIdentifier } from "@/lib/mentions";
import {
  notifyShowingOnlyChannel,
  notifyAllChannelsReset,
  notifyShowingOnlyTag,
  notifyNoFrequentPeople,
  notifyFrequentPeopleDeselected,
  notifyShowingOnlyPersonExclusive,
  notifyPersonFilterToggled,
} from "@/lib/notifications";
import {
  loadPersistedChannelFilters,
  loadPersistedChannelMatchMode,
  savePersistedChannelFilters,
  savePersistedChannelMatchMode,
} from "@/infrastructure/preferences/filter-preferences-storage";
import {
  mapPeopleSelection,
  setAllChannelFilters,
  setExclusiveChannelFilter,
  shouldToggleOffExclusiveChannel,
  shouldToggleOffExclusivePerson,
} from "@/domain/content/filter-state-utils";
import {
  clampMinPriority,
  clampRecentDays,
  normalizeQuickFilterState,
} from "@/domain/content/quick-filter-constraints";
import { useFilterUrlSync } from "@/features/feed-page/controllers/use-filter-url-sync";
import { featureDebugLog } from "@/lib/feature-debug";
import type { Channel, ChannelMatchMode, PostedTag, QuickFilterState, Relay } from "@/types";
import type { Person } from "@/types/person";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import type { FeedInteractionHandlerMap } from "@/features/feed-page/interactions/feed-interaction-pipeline";

interface UseIndexFiltersOptions {
  relays: Relay[];
  activeRelayIds: Set<string>;
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  channels: Channel[];
  composeChannels: Channel[];
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  sidebarPeople: Person[];
  hasLiveHydratedScope?: boolean;
  isHydrating?: boolean;
}

export function useIndexFilters({
  relays,
  activeRelayIds,
  setActiveRelayIds,
  channels,
  composeChannels,
  people,
  setPeople,
  sidebarPeople,
  hasLiveHydratedScope = false,
  isHydrating = false,
}: UseIndexFiltersOptions) {
  const setPostedTags = useTaskMutationStore((s) => s.setPostedTags);
  const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>(null);
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    () => loadPersistedChannelFilters()
  );
  const [channelMatchMode, setChannelMatchMode] = useState<ChannelMatchMode>(
    () => loadPersistedChannelMatchMode()
  );
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>(() => normalizeQuickFilterState());

  /**
   * Capture the current filter slice so undo actions on toast notifications can
   * restore it verbatim. We snapshot every piece of state our filter handlers
   * touch (channels, people, posted tags, active relay ids) so any combination
   * of mutations can be rolled back as a unit.
   */
  const captureFilterSnapshot = useCallback(() => {
    const channelFilterStatesSnapshot = new Map(channelFilterStates);
    const peopleSnapshot = people.map((person) => ({ ...person }));
    const activeRelayIdsSnapshot = new Set(activeRelayIds);
    const postedTagsSnapshot = useTaskMutationStore.getState().postedTags.map((entry) => ({
      ...entry,
      relayIds: [...entry.relayIds],
    }));
    return () => {
      setChannelFilterStates(() => new Map(channelFilterStatesSnapshot));
      setPeople(() => peopleSnapshot.map((person) => ({ ...person })));
      setActiveRelayIds(() => new Set(activeRelayIdsSnapshot));
      setPostedTags(() => postedTagsSnapshot.map((entry) => ({ ...entry, relayIds: [...entry.relayIds] })));
    };
  }, [activeRelayIds, channelFilterStates, people, setActiveRelayIds, setPeople, setPostedTags]);


  const channelsWithState = useMemo(
    () =>
      channels.map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) || "neutral",
      })),
    [channelFilterStates, channels]
  );

  const composeChannelsWithState = useMemo(
    () =>
      composeChannels.map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) || "neutral",
      })),
    [channelFilterStates, composeChannels]
  );

  const isFilterPruneReady = hasLiveHydratedScope || !isHydrating;

  useEffect(() => {
    if (!isFilterPruneReady) return;
    const availableChannelIds = new Set([
      ...channels.map((channel) => channel.id),
      ...composeChannels
        .filter((channel) => channel.usageCount !== 0)
        .map((channel) => channel.id),
    ]);
    setChannelFilterStates((prev) => {
      let changed = false;
      const next = new Map(prev);

      for (const [id, state] of prev) {
        if (state !== "neutral") continue;
        if (availableChannelIds.has(id)) continue;
        next.delete(id);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [channels, composeChannels, isFilterPruneReady]);

  useEffect(() => {
    if (!isFilterPruneReady) return;
    const sidebarPersonIds = new Set(sidebarPeople.map((person) => person.id));
    setPeople((prev) => {
      let changed = false;
      const next = prev.map((person) => {
        if (!person.isSelected || sidebarPersonIds.has(person.id)) return person;
        changed = true;
        return { ...person, isSelected: false };
      });

      return changed ? next : prev;
    });
  }, [isFilterPruneReady, setPeople, sidebarPeople]);

  useFilterUrlSync({
    activeRelayIds,
    setActiveRelayIds,
    channelFilterStates,
    people,
    setChannelFilterStates,
    setPeople,
  });

  useEffect(() => {
    savePersistedChannelFilters(channelFilterStates);
  }, [channelFilterStates]);

  useEffect(() => {
    savePersistedChannelMatchMode(channelMatchMode);
  }, [channelMatchMode]);

  const normalizeInteractivePerson = useCallback((person: Person): Person => ({
    ...person,
    avatar: person.avatar || "",
    isOnline: person.isOnline ?? true,
    onlineStatus: person.onlineStatus ?? "online",
    isSelected: person.isSelected ?? false,
  }), []);

  const queueMentionForPerson = useCallback((person: Person) => {
    const mention = `@${getPreferredMentionIdentifier(person)}`;
    setMentionRequest({ mention, id: Date.now() });
    return mention;
  }, []);

  const applyExclusivePersonFilter = useCallback((person: Person) => {
    const normalizedPerson = normalizeInteractivePerson(person);
    setPeople((prev) => {
      const next = prev.some((entry) => entry.id === normalizedPerson.id)
        ? prev
        : [...prev, normalizedPerson];
      return next.map((entry) => ({
        ...entry,
        isSelected: entry.id === normalizedPerson.id,
      }));
    });
  }, [normalizeInteractivePerson, setPeople]);

  const toggleInteractivePerson = useCallback((person: Person) => {
    const normalizedPerson = normalizeInteractivePerson(person);
    setPeople((prev) => {
      const next = prev.some((entry) => entry.id === normalizedPerson.id)
        ? prev
        : [...prev, normalizedPerson];
      return next.map((entry) =>
        entry.id === normalizedPerson.id ? { ...entry, isSelected: !entry.isSelected } : entry
      );
    });
  }, [normalizeInteractivePerson, setPeople]);

  const toggleChannel = useCallback((channelId: string) => {
    setChannelFilterStates((prev) => {
      const next = new Map(prev);
      const currentState = next.get(channelId) || "neutral";
      const states: Channel["filterState"][] = ["neutral", "included", "excluded"];
      const currentIndex = states.indexOf(currentState);
      next.set(channelId, states[(currentIndex + 1) % states.length]);
      return next;
    });
  }, [setChannelFilterStates]);

  const showOnlyChannel = useCallback((channelId: string) => {
    const shouldToggleOff = shouldToggleOffExclusiveChannel(channels, channelFilterStates, channelId);
    if (shouldToggleOff) {
      setChannelFilterStates((prev) => {
        const next = new Map(prev);
        next.set(channelId, "neutral");
        return next;
      });
      return;
    }
    const restoreSnapshot = captureFilterSnapshot();
    setChannelFilterStates(() => setExclusiveChannelFilter(channels, channelId));
    const channel = channelsWithState.find((entry) => entry.id === channelId);
    notifyShowingOnlyChannel(channel?.name || channelId, { onUndo: restoreSnapshot });
  }, [captureFilterSnapshot, channels, channelFilterStates, channelsWithState, setChannelFilterStates]);

  const toggleAllChannels = useCallback(() => {
    const hasActiveFilters =
      channelFilterStates.size > 0 &&
      Array.from(channelFilterStates.values()).some((state) => state !== "neutral");
    if (!hasActiveFilters) return;
    const restoreSnapshot = captureFilterSnapshot();
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    notifyAllChannelsReset({ onUndo: restoreSnapshot });
  }, [captureFilterSnapshot, channels, channelFilterStates, setChannelFilterStates]);

  const togglePerson = useCallback((personId: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === personId ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  }, [setPeople]);

  const showOnlyPerson = useCallback((personId: string) => {
    if (shouldToggleOffExclusivePerson(people, personId)) {
      setPeople((prev) => mapPeopleSelection(prev, () => false));
      return;
    }
    const restoreSnapshot = captureFilterSnapshot();
    setPeople((prev) => mapPeopleSelection(prev, (person) => person.id === personId));
    const person = people.find((entry) => entry.id === personId);
    notifyShowingOnlyPersonExclusive(person, { onUndo: restoreSnapshot });
  }, [captureFilterSnapshot, people, setPeople]);

  const toggleAllPeople = useCallback(() => {
    if (sidebarPeople.length === 0) {
      notifyNoFrequentPeople();
      return;
    }
    const sidebarIds = new Set(sidebarPeople.map((person) => person.id));
    const hasSelectedPeople = people.some((person) => sidebarIds.has(person.id) && person.isSelected);
    if (!hasSelectedPeople) return;
    const restoreSnapshot = captureFilterSnapshot();
    setPeople((prev) =>
      prev.map((person) =>
        sidebarIds.has(person.id)
          ? { ...person, isSelected: false }
          : person
      )
    );
    notifyFrequentPeopleDeselected({ onUndo: restoreSnapshot });
  }, [captureFilterSnapshot, people, setPeople, sidebarPeople]);

  const resetFiltersToDefault = useCallback(() => {
    setActiveRelayIds(new Set());
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setChannelMatchMode("and");
    setPeople((prev) => mapPeopleSelection(prev, () => false));
    setQuickFilters(normalizeQuickFilterState());
    featureDebugLog("quick-filters", "Reset filters to defaults with all feeds deactivated", {
      availableRelayCount: relays.length,
    });
  }, [channels, relays, setActiveRelayIds, setChannelFilterStates, setChannelMatchMode, setPeople, setQuickFilters]);

  const filterHandlers: FeedInteractionHandlerMap = useMemo(() => ({
    "filter.clearChannel": (intent) => {
      setChannelFilterStates((prev) => {
        if ((prev.get(intent.channelId) || "neutral") === "neutral") return prev;
        const next = new Map(prev);
        next.set(intent.channelId, "neutral");
        return next;
      });
    },
    "filter.applyHashtagExclusive": (intent) => {
      const normalizedTag = intent.tag.trim().toLowerCase();
      if (!normalizedTag) return;
      const existsInSidebar = channels.some((channel) => channel.name.toLowerCase() === normalizedTag);
      const scopedRelayIds = relays.filter((relay) => relay.isActive).map((relay) => relay.id);

      const restoreSnapshot = captureFilterSnapshot();

      if (!existsInSidebar) {
        setPostedTags((prev) => {
          const next = prev.filter((entry) => entry.name !== normalizedTag);
          return [...next, { name: normalizedTag, relayIds: scopedRelayIds }];
        });
      }

      setChannelFilterStates(() => {
        const channelId = channels.find((channel) => channel.name.toLowerCase() === normalizedTag)?.id || normalizedTag;
        const allChannels = existsInSidebar
          ? channels
          : [...channels, { id: normalizedTag, name: normalizedTag, filterState: "neutral" as const }];
        return setExclusiveChannelFilter(allChannels, channelId);
      });

      notifyShowingOnlyTag(normalizedTag, { onUndo: restoreSnapshot });
    },
    "filter.clearPerson": (intent) => {
      setPeople((prev) =>
        prev.map((person) =>
          person.id === intent.personId && person.isSelected ? { ...person, isSelected: false } : person
        )
      );
    },
    "person.filter.exclusive": (intent) => {
      const restoreSnapshot = captureFilterSnapshot();
      applyExclusivePersonFilter(intent.person);
      notifyShowingOnlyPersonExclusive(intent.person, { onUndo: restoreSnapshot });
    },
    "person.filter.toggle": (intent) => {
      const wasSelected = people.find((person) => person.id === intent.person.id)?.isSelected ?? intent.person.isSelected;
      const restoreSnapshot = captureFilterSnapshot();
      toggleInteractivePerson(intent.person);
      notifyPersonFilterToggled(intent.person, wasSelected, { onUndo: restoreSnapshot });
    },
    "person.compose.mention": (intent) => {
      queueMentionForPerson(intent.person);
    },
    "person.filterAndMention": (intent) => {
      const restoreSnapshot = captureFilterSnapshot();
      applyExclusivePersonFilter(intent.person);
      queueMentionForPerson(intent.person);
      notifyShowingOnlyPersonExclusive(intent.person, { onUndo: restoreSnapshot });
    },
    "filter.applyAuthorExclusive": (intent) => {
      const restoreSnapshot = captureFilterSnapshot();
      applyExclusivePersonFilter(intent.author);
      queueMentionForPerson(intent.author);
      notifyShowingOnlyPersonExclusive(intent.author, { onUndo: restoreSnapshot });
    },
    "sidebar.quickFilter.recentDays.change": (intent) => {
      const nextDays = clampRecentDays(intent.days);
      setQuickFilters((previous) => {
        const next = { ...previous, recentDays: nextDays };
        featureDebugLog("quick-filters", "Updated recent-days filter value", { nextDays, enabled: next.recentEnabled });
        return next;
      });
    },
    "sidebar.quickFilter.recentEnabled.change": (intent) => {
      setQuickFilters((previous) => {
        const next = { ...previous, recentEnabled: intent.enabled };
        featureDebugLog("quick-filters", "Toggled recent-days filter", { enabled: intent.enabled, days: next.recentDays });
        return next;
      });
    },
    "sidebar.quickFilter.minPriority.change": (intent) => {
      const nextMinPriority = clampMinPriority(intent.priority);
      setQuickFilters((previous) => {
        const next = { ...previous, minPriority: nextMinPriority };
        featureDebugLog("quick-filters", "Updated minimum-priority filter value", {
          nextMinPriority,
          enabled: next.priorityEnabled,
        });
        return next;
      });
    },
    "sidebar.quickFilter.priorityEnabled.change": (intent) => {
      setQuickFilters((previous) => {
        const next = { ...previous, priorityEnabled: intent.enabled };
        featureDebugLog("quick-filters", "Toggled minimum-priority filter", {
          enabled: intent.enabled,
          minPriority: next.minPriority,
        });
        return next;
      });
    },
    "filter.resetAll": () => {
      resetFiltersToDefault();
    },
  }), [
    captureFilterSnapshot,
    channels,
    relays,
    setPostedTags,
    people,
    setPeople,
    applyExclusivePersonFilter,
    queueMentionForPerson,
    setQuickFilters,
    setChannelFilterStates,
    toggleInteractivePerson,
    resetFiltersToDefault,
  ]);

  return {
    mentionRequest,
    setMentionRequest,
    channelFilterStates,
    setChannelFilterStates,
    channelMatchMode,
    setChannelMatchMode,
    composeChannelsWithState,
    quickFilters,
    setQuickFilters,
    handlers: filterHandlers,
    resetFiltersToDefault,
    toggleChannel,
    showOnlyChannel,
    toggleAllChannels,
    togglePerson,
    showOnlyPerson,
    toggleAllPeople,
  };
}
