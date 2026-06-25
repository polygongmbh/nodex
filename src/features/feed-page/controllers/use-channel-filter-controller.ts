import { useCallback, useEffect, useMemo, useState } from "react";
import { getPreferredMentionIdentifier } from "@/lib/mentions";
import {
  notifyShowingOnlyChannel,
  notifyAllChannelsReset,
  notifyShowingTag,
  notifyNoFrequentPeople,
  notifyFrequentPeopleDeselected,
  notifyShowingOnlyPersonExclusive,
  notifyPersonFilterToggled,
} from "@/lib/notifications";
import {
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
import type { Channel, QuickFilterState, Relay } from "@/types";
import type { Person, SelectablePerson } from "@/types/person";
import { getResolvedPerson } from "@/infrastructure/nostr/use-nostr-profiles";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import type { FeedInteractionHandlerMap } from "@/features/feed-page/interactions/feed-interaction-pipeline";
import type { Dispatch, SetStateAction } from "react";

interface UseChannelFilterControllerOptions {
  relays: Relay[];
  channels: Channel[];
  people: SelectablePerson[];
  setPeople: Dispatch<SetStateAction<SelectablePerson[]>>;
  sidebarPeople: SelectablePerson[];
  hasLiveHydratedScope?: boolean;
  isHydrating?: boolean;
}

export function useChannelFilterController({
  relays,
  channels,
  people,
  setPeople,
  sidebarPeople,
  hasLiveHydratedScope = false,
  isHydrating = false,
}: UseChannelFilterControllerOptions) {
  const setPostedTags = useTaskMutationStore((s) => s.setPostedTags);
  const activeRelayIds = useFilterStore((s) => s.activeRelayIds);
  const setActiveRelayIds = useFilterStore((s) => s.setActiveRelayIds);
  const channelFilterStates = useFilterStore((s) => s.channelFilterStates);
  const setChannelFilterStates = useFilterStore((s) => s.setChannelFilterStates);
  const channelMatchMode = useFilterStore((s) => s.channelMatchMode);
  const setChannelMatchMode = useFilterStore((s) => s.setChannelMatchMode);
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const setSelectedPubkeys = useFilterStore((s) => s.setSelectedPubkeys);
  const selectOnlyPerson = useFilterStore((s) => s.selectOnlyPerson);
  const togglePersonSelection = useFilterStore((s) => s.togglePersonSelection);
  const deselectPeople = useFilterStore((s) => s.deselectPeople);
  const retainSelectedPeople = useFilterStore((s) => s.retainSelectedPeople);
  const clearSelectedPeople = useFilterStore((s) => s.clearSelectedPeople);

  const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>(null);
  const handleMentionRequestConsumed = useCallback((requestId: number) => {
    setMentionRequest((current) => (current?.id === requestId ? null : current));
  }, []);
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>(() => normalizeQuickFilterState());

  const captureFilterSnapshot = useCallback(() => {
    const channelFilterStatesSnapshot = new Map(channelFilterStates);
    const selectedPubkeysSnapshot = new Set(selectedPubkeys);
    const activeRelayIdsSnapshot = new Set(activeRelayIds);
    const postedTagsSnapshot = useTaskMutationStore.getState().postedTags.map((entry) => ({
      ...entry,
      relayIds: [...entry.relayIds],
    }));
    return () => {
      setChannelFilterStates(() => new Map(channelFilterStatesSnapshot));
      setSelectedPubkeys(new Set(selectedPubkeysSnapshot));
      setActiveRelayIds(() => new Set(activeRelayIdsSnapshot));
      setPostedTags(() => postedTagsSnapshot.map((entry) => ({ ...entry, relayIds: [...entry.relayIds] })));
    };
  }, [activeRelayIds, channelFilterStates, selectedPubkeys, setActiveRelayIds, setChannelFilterStates, setSelectedPubkeys, setPostedTags]);

  const channelsWithState = useMemo(
    () =>
      channels.map((channel) => ({
        ...channel,
        filterState: channelFilterStates.get(channel.id) || "neutral",
      })),
    [channelFilterStates, channels]
  );

  const isFilterPruneReady = hasLiveHydratedScope || !isHydrating;

  useEffect(() => {
    if (!isFilterPruneReady) return;
    const availableChannelIds = new Set(channels.map((channel) => channel.id));
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
  }, [channels, isFilterPruneReady, setChannelFilterStates]);

  useEffect(() => {
    if (!isFilterPruneReady) return;
    retainSelectedPeople(sidebarPeople.map((person) => person.pubkey));
  }, [isFilterPruneReady, retainSelectedPeople, sidebarPeople]);

  useFilterUrlSync({
    activeRelayIds,
    setActiveRelayIds,
    channelFilterStates,
    selectedPubkeys,
    setChannelFilterStates,
    setSelectedPubkeys,
  });

  const normalizeInteractivePerson = useCallback((person: Person): SelectablePerson => ({
    ...person,
    avatar: person.avatar || "",
  }), []);

  // Ensure a person clicked from the feed (who may not be in the sidebar list
  // yet) exists in the iteration array, so a selected row can render for them.
  const ensurePersonInList = useCallback((person: SelectablePerson) => {
    setPeople((prev) =>
      prev.some((entry) => entry.pubkey === person.pubkey) ? prev : [...prev, person]
    );
  }, [setPeople]);

  const queueMentionForPerson = useCallback((person: SelectablePerson) => {
    const mention = `@${getPreferredMentionIdentifier(person)}`;
    setMentionRequest({ mention, id: Date.now() });
    return mention;
  }, []);

  const applyExclusivePersonFilter = useCallback((person: Person) => {
    const normalizedPerson = normalizeInteractivePerson(person);
    ensurePersonInList(normalizedPerson);
    selectOnlyPerson(normalizedPerson.pubkey);
  }, [ensurePersonInList, normalizeInteractivePerson, selectOnlyPerson]);

  const toggleInteractivePerson = useCallback((person: Person) => {
    const normalizedPerson = normalizeInteractivePerson(person);
    ensurePersonInList(normalizedPerson);
    togglePersonSelection(normalizedPerson.pubkey);
  }, [ensurePersonInList, normalizeInteractivePerson, togglePersonSelection]);

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
    togglePersonSelection(personId);
  }, [togglePersonSelection]);

  const showOnlyPerson = useCallback((personId: string) => {
    if (shouldToggleOffExclusivePerson(selectedPubkeys, personId)) {
      clearSelectedPeople();
      return;
    }
    const restoreSnapshot = captureFilterSnapshot();
    selectOnlyPerson(personId);
    const person = people.find((entry) => entry.pubkey === personId);
    notifyShowingOnlyPersonExclusive(person, { onUndo: restoreSnapshot });
  }, [captureFilterSnapshot, clearSelectedPeople, people, selectOnlyPerson, selectedPubkeys]);

  const toggleAllPeople = useCallback(() => {
    if (sidebarPeople.length === 0) {
      notifyNoFrequentPeople();
      return;
    }
    const sidebarIds = new Set(sidebarPeople.map((person) => person.pubkey));
    const hasSelectedPeople = [...selectedPubkeys].some((pubkey) => sidebarIds.has(pubkey));
    if (!hasSelectedPeople) return;
    const restoreSnapshot = captureFilterSnapshot();
    deselectPeople(sidebarIds);
    notifyFrequentPeopleDeselected({ onUndo: restoreSnapshot });
  }, [captureFilterSnapshot, deselectPeople, selectedPubkeys, sidebarPeople]);

  const resetFiltersToDefault = useCallback(() => {
    setActiveRelayIds(new Set());
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setChannelMatchMode("and");
    clearSelectedPeople();
    setQuickFilters(normalizeQuickFilterState());
    featureDebugLog("quick-filters", "Reset filters to defaults with all feeds deactivated", {
      availableRelayCount: relays.length,
    });
  }, [channels, relays, setActiveRelayIds, setChannelFilterStates, setChannelMatchMode, clearSelectedPeople]);

  const filterHandlers: FeedInteractionHandlerMap = useMemo(() => ({
    "filter.clearChannel": (intent) => {
      setChannelFilterStates((prev) => {
        if ((prev.get(intent.channelId) || "neutral") === "neutral") return prev;
        const next = new Map(prev);
        next.set(intent.channelId, "neutral");
        return next;
      });
    },
    "filter.applyHashtagInclude": (intent) => {
      const normalizedTag = intent.tag.trim().toLowerCase();
      if (!normalizedTag) return;
      const existingChannel = channels.find((channel) => channel.name.toLowerCase() === normalizedTag);
      const channelId = existingChannel?.id || normalizedTag;
      const scopedRelayIds = relays.filter((relay) => relay.isActive).map((relay) => relay.id);

      const restoreSnapshot = captureFilterSnapshot();

      if (!existingChannel) {
        setPostedTags((prev) => {
          const next = prev.filter((entry) => entry.name !== normalizedTag);
          return [...next, { name: normalizedTag, relayIds: scopedRelayIds }];
        });
      }

      setChannelFilterStates((prev) => {
        const next = new Map(prev);
        next.set(channelId, "included");
        return next;
      });

      notifyShowingTag(normalizedTag, { onUndo: restoreSnapshot });
    },
    "filter.clearPerson": (intent) => {
      deselectPeople([intent.personId]);
    },
    "person.filter.exclusive": (intent) => {
      const person = getResolvedPerson(intent.pubkey);
      const restoreSnapshot = captureFilterSnapshot();
      applyExclusivePersonFilter(person);
      notifyShowingOnlyPersonExclusive(person, { onUndo: restoreSnapshot });
    },
    "person.filter.toggle": (intent) => {
      const person = getResolvedPerson(intent.pubkey);
      const wasSelected = selectedPubkeys.has(person.pubkey);
      const restoreSnapshot = captureFilterSnapshot();
      toggleInteractivePerson(person);
      notifyPersonFilterToggled(person, wasSelected, { onUndo: restoreSnapshot });
    },
    "person.compose.mention": (intent) => {
      queueMentionForPerson(getResolvedPerson(intent.pubkey));
    },
    "person.filterAndMention": (intent) => {
      const person = getResolvedPerson(intent.pubkey);
      const restoreSnapshot = captureFilterSnapshot();
      applyExclusivePersonFilter(person);
      queueMentionForPerson(person);
      notifyShowingOnlyPersonExclusive(person, { onUndo: restoreSnapshot });
    },
    "filter.applyAuthorExclusive": (intent) => {
      const person = getResolvedPerson(intent.pubkey);
      const restoreSnapshot = captureFilterSnapshot();
      applyExclusivePersonFilter(person);
      queueMentionForPerson(person);
      notifyShowingOnlyPersonExclusive(person, { onUndo: restoreSnapshot });
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
    selectedPubkeys,
    deselectPeople,
    applyExclusivePersonFilter,
    queueMentionForPerson,
    setQuickFilters,
    setChannelFilterStates,
    toggleInteractivePerson,
    resetFiltersToDefault,
  ]);

  return {
    mentionRequest,
    onMentionRequestConsumed: handleMentionRequestConsumed,
    channelFilterStates,
    setChannelFilterStates,
    channelMatchMode,
    setChannelMatchMode,
    channelsWithState,
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
