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
import type { Channel, ChannelMatchMode, Person, PostedTag, QuickFilterState, Relay } from "@/types";
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
  isMobile: boolean;
  hasLiveHydratedScope?: boolean;
  isHydrating?: boolean;
  setSearchQuery: Dispatch<SetStateAction<string>>;
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
  isMobile,
  hasLiveHydratedScope = false,
  isHydrating = false,
  setSearchQuery,
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
      const allNeutral =
        channelFilterStates.size === 0 ||
        Array.from(channelFilterStates.values()).every((state) => state === "neutral");
      setChannelFilterStates(() => setAllChannelFilters(channels, allNeutral ? "included" : "neutral"));
      toast(allNeutral ? t("toasts.success.allChannelsIncluded") : t("toasts.success.allChannelsReset"));
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
        t("toasts.success.showingOnlyPerson", {
          personName: person?.displayName || person?.name || t("toasts.success.selectedUserFallback"),
        })
      );
    },
    "sidebar.person.toggleAll": () => {
      if (sidebarPeople.length === 0) {
        toast(t("toasts.success.noFrequentPeople"));
        return;
      }
      const sidebarIds = new Set(sidebarPeople.map((person) => person.id));
      const selectedCount = sidebarPeople.filter((person) => person.isSelected).length;
      const shouldSelectAll = selectedCount !== sidebarPeople.length;
      setPeople((prev) =>
        prev.map((person) =>
          sidebarIds.has(person.id)
            ? { ...person, isSelected: shouldSelectAll }
            : person
        )
      );
      toast(
        shouldSelectAll
          ? t("toasts.success.frequentPeopleSelected")
          : t("toasts.success.frequentPeopleDeselected")
      );
    },
    "filter.applyAuthorExclusive": (intent) => {
      const author = intent.author;
      setPeople((prev) => {
        const exists = prev.some((person) => person.id === author.id);
        const next = exists
          ? prev
          : [
              ...prev,
              {
                ...author,
                avatar: author.avatar || "",
                isOnline: author.isOnline ?? true,
                onlineStatus: author.onlineStatus ?? "online",
                isSelected: false,
              },
            ];
        return next.map((person) => ({
          ...person,
          isSelected: person.id === author.id,
        }));
      });
      const mention = `@${getPreferredMentionIdentifier(author)}`;
      setMentionRequest({ mention, id: Date.now() });
      if (isMobile) {
        setSearchQuery((previous) => {
          const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(previous)) {
            return previous;
          }
          const separator = previous && !previous.endsWith(" ") ? " " : "";
          return `${previous}${separator}${mention} `;
        });
      }
      toast(
        t("toasts.success.showingOnlyAuthorAndTagging", {
          authorName: author.displayName || author.name,
          mention,
        })
      );
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
    isMobile,
    setSearchQuery,
    setQuickFilters,
    setChannelFilterStates,
    setChannelMatchMode,
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
