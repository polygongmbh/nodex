import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { getPreferredMentionIdentifier } from "@/lib/mentions";
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
import { isPubkeyDerivedPlaceholder, type Person } from "@/types/person";
import type { FeedInteractionHandlerMap } from "@/features/feed-page/interactions/feed-interaction-pipeline";

interface UseIndexFiltersOptions {
  relays: Relay[];
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  channels: Channel[];
  composeChannels: Channel[];
  setPostedTags: Dispatch<SetStateAction<PostedTag[]>>;
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  sidebarPeople: Person[];
  hasLiveHydratedScope?: boolean;
  isHydrating?: boolean;
  t: TFunction;
}

export function useIndexFilters({
  relays,
  setActiveRelayIds,
  channels,
  composeChannels,
  setPostedTags,
  people,
  setPeople,
  sidebarPeople,
  hasLiveHydratedScope = false,
  isHydrating = false,
  t,
}: UseIndexFiltersOptions) {
  const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>(null);
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    () => loadPersistedChannelFilters()
  );
  const [channelMatchMode, setChannelMatchMode] = useState<ChannelMatchMode>(
    () => loadPersistedChannelMatchMode()
  );
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>(() => normalizeQuickFilterState());

  const getToastPersonName = useCallback((person?: Person | null) => {
    if (!person) return t("toasts.success.selectedUserFallback");

    const displayName = person.displayName.trim();
    if (displayName && !isPubkeyDerivedPlaceholder(displayName, person.id)) return displayName;

    const username = person.name.trim();
    if (username && !isPubkeyDerivedPlaceholder(username, person.id)) return username;

    return t("toasts.success.selectedUserFallback");
  }, [t]);

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

      for (const [id] of prev) {
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

  const filterHandlers: FeedInteractionHandlerMap = useMemo(() => ({
    "sidebar.channel.toggle": (intent) => {
      setChannelFilterStates((prev) => {
        const next = new Map(prev);
        const currentState = next.get(intent.channelId) || "neutral";
        const states: Channel["filterState"][] = ["neutral", "included", "excluded"];
        const currentIndex = states.indexOf(currentState);
        next.set(intent.channelId, states[(currentIndex + 1) % states.length]);
        return next;
      });
    },
    "filter.clearChannel": (intent) => {
      setChannelFilterStates((prev) => {
        if ((prev.get(intent.channelId) || "neutral") === "neutral") return prev;
        const next = new Map(prev);
        next.set(intent.channelId, "neutral");
        return next;
      });
    },
    "sidebar.channel.exclusive": (intent) => {
      const shouldToggleOff = shouldToggleOffExclusiveChannel(channels, channelFilterStates, intent.channelId);
      if (shouldToggleOff) {
        setChannelFilterStates((prev) => {
          const next = new Map(prev);
          next.set(intent.channelId, "neutral");
          return next;
        });
        return;
      }
      setChannelFilterStates(() => setExclusiveChannelFilter(channels, intent.channelId));
      const channel = channelsWithState.find((entry) => entry.id === intent.channelId);
      toast(t("toasts.success.showingOnlyChannel", { channelName: channel?.name || intent.channelId }));
    },
    "sidebar.channel.toggleAll": () => {
      const hasActiveFilters =
        channelFilterStates.size > 0 &&
        Array.from(channelFilterStates.values()).some((state) => state !== "neutral");
      if (!hasActiveFilters) return;
      setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
      toast(t("toasts.success.allChannelsReset"));
    },
    "sidebar.channel.matchMode.change": (intent) => {
      setChannelMatchMode(intent.mode);
    },
    "filter.applyHashtagExclusive": (intent) => {
      const normalizedTag = intent.tag.trim().toLowerCase();
      if (!normalizedTag) return;
      const existsInSidebar = channels.some((channel) => channel.name.toLowerCase() === normalizedTag);
      const scopedRelayIds = relays.filter((relay) => relay.isActive).map((relay) => relay.id);

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

      toast(t("toasts.success.showingOnlyTag", { tag: normalizedTag }));
    },
    "sidebar.person.toggle": (intent) => {
      setPeople((prev) =>
        prev.map((person) =>
          person.id === intent.personId ? { ...person, isSelected: !person.isSelected } : person
        )
      );
    },
    "filter.clearPerson": (intent) => {
      setPeople((prev) =>
        prev.map((person) =>
          person.id === intent.personId && person.isSelected ? { ...person, isSelected: false } : person
        )
      );
    },
    "sidebar.person.exclusive": (intent) => {
      if (shouldToggleOffExclusivePerson(people, intent.personId)) {
        setPeople((prev) => mapPeopleSelection(prev, () => false));
        return;
      }
      setPeople((prev) => mapPeopleSelection(prev, (person) => person.id === intent.personId));
      const person = people.find((entry) => entry.id === intent.personId);
      toast(
        t("toasts.success.showingOnlyPersonExclusive", {
          personName: getToastPersonName(person),
        })
      );
    },
    "sidebar.person.toggleAll": () => {
      if (sidebarPeople.length === 0) {
        toast(t("toasts.success.noFrequentPeople"));
        return;
      }
      const sidebarIds = new Set(sidebarPeople.map((person) => person.id));
      const hasSelectedPeople = people.some((person) => sidebarIds.has(person.id) && person.isSelected);
      if (!hasSelectedPeople) return;
      setPeople((prev) =>
        prev.map((person) =>
          sidebarIds.has(person.id)
            ? { ...person, isSelected: false }
            : person
        )
      );
      toast(t("toasts.success.frequentPeopleDeselected"));
    },
    "person.filter.exclusive": (intent) => {
      applyExclusivePersonFilter(intent.person);
      toast(
        t("toasts.success.showingOnlyPersonExclusive", {
          personName: getToastPersonName(intent.person),
        })
      );
    },
    "person.filter.toggle": (intent) => {
      const wasSelected = people.find((person) => person.id === intent.person.id)?.isSelected ?? intent.person.isSelected;
      toggleInteractivePerson(intent.person);
      toast(t(
        wasSelected ? "toasts.success.removedPersonFilter" : "toasts.success.showingOnlyPerson",
        { personName: getToastPersonName(intent.person) }
      ));
    },
    "person.compose.mention": (intent) => {
      queueMentionForPerson(intent.person);
    },
    "person.filterAndMention": (intent) => {
      applyExclusivePersonFilter(intent.person);
      queueMentionForPerson(intent.person);
    },
    "filter.applyAuthorExclusive": (intent) => {
      applyExclusivePersonFilter(intent.author);
      queueMentionForPerson(intent.author);
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
  }), [
    channels,
    channelFilterStates,
    channelsWithState,
    relays,
    setPostedTags,
    people,
    setPeople,
    sidebarPeople,
    applyExclusivePersonFilter,
    getToastPersonName,
    queueMentionForPerson,
    setQuickFilters,
    setChannelFilterStates,
    setChannelMatchMode,
    toggleInteractivePerson,
    t,
  ]);

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
  };
}
