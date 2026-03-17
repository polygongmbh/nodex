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
} from "@/lib/filter-preferences";
import {
  mapPeopleSelection,
  setAllChannelFilters,
  setExclusiveChannelFilter,
  shouldToggleOffExclusiveChannel,
  shouldToggleOffExclusivePerson,
} from "@/domain/content/filter-state-utils";
import { useFilterUrlSync } from "@/hooks/use-filter-url-sync";
import type { Channel, ChannelMatchMode, Person, Relay } from "@/types";

interface UseIndexFiltersOptions {
  relays: Relay[];
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  channels: Channel[];
  composeChannels: Channel[];
  postedTags: string[];
  setPostedTags: Dispatch<SetStateAction<string[]>>;
  people: Person[];
  setPeople: Dispatch<SetStateAction<Person[]>>;
  sidebarPeople: Person[];
  isMobile: boolean;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  bumpChannelFrecency: (tag: string, weight?: number) => void;
  t: TFunction;
}

export function useIndexFilters({
  relays,
  setActiveRelayIds,
  channels,
  composeChannels,
  postedTags,
  setPostedTags,
  people,
  setPeople,
  sidebarPeople,
  isMobile,
  setSearchQuery,
  bumpChannelFrecency,
  t,
}: UseIndexFiltersOptions) {
  const [mentionRequest, setMentionRequest] = useState<{ mention: string; id: number } | null>(null);
  const [channelFilterStates, setChannelFilterStates] = useState<Map<string, Channel["filterState"]>>(
    () => loadPersistedChannelFilters()
  );
  const [channelMatchMode, setChannelMatchMode] = useState<ChannelMatchMode>(
    () => loadPersistedChannelMatchMode()
  );

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

  const handleChannelToggle = useCallback((id: string) => {
    bumpChannelFrecency(id, 1.25);
    setChannelFilterStates((prev) => {
      const next = new Map(prev);
      const currentState = next.get(id) || "neutral";
      const states: Channel["filterState"][] = ["neutral", "included", "excluded"];
      const currentIndex = states.indexOf(currentState);
      next.set(id, states[(currentIndex + 1) % states.length]);
      return next;
    });
  }, [bumpChannelFrecency]);

  const handleChannelExclusive = useCallback((id: string) => {
    bumpChannelFrecency(id, 1.6);
    const shouldToggleOff = shouldToggleOffExclusiveChannel(channels, channelFilterStates, id);
    if (shouldToggleOff) {
      setChannelFilterStates((prev) => {
        const next = new Map(prev);
        next.set(id, "neutral");
        return next;
      });
      return;
    }

    setChannelFilterStates(() => setExclusiveChannelFilter(channels, id));
    const channel = channelsWithState.find((entry) => entry.id === id);
    toast(t("toasts.success.showingOnlyChannel", { channelName: channel?.name || id }));
  }, [bumpChannelFrecency, channelFilterStates, channels, channelsWithState, t]);

  const handleToggleAllChannels = useCallback(() => {
    const allNeutral =
      channelFilterStates.size === 0 ||
      Array.from(channelFilterStates.values()).every((state) => state === "neutral");
    setChannelFilterStates(() => setAllChannelFilters(channels, allNeutral ? "included" : "neutral"));
    toast(allNeutral ? t("toasts.success.allChannelsIncluded") : t("toasts.success.allChannelsReset"));
  }, [channelFilterStates, channels, t]);

  const handleChannelMatchModeChange = useCallback((mode: ChannelMatchMode) => {
    setChannelMatchMode(mode);
  }, []);

  const handleHashtagExclusive = useCallback((tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) return;

    bumpChannelFrecency(normalizedTag, 1.9);
    const existsInSidebar = channels.some((channel) => channel.name.toLowerCase() === normalizedTag);

    if (!existsInSidebar) {
      setPostedTags((prev) => Array.from(new Set([...prev, normalizedTag])));
    }

    setChannelFilterStates(() => {
      const channelId = channels.find((channel) => channel.name.toLowerCase() === normalizedTag)?.id || normalizedTag;
      const allChannels = existsInSidebar
        ? channels
        : [...channels, { id: normalizedTag, name: normalizedTag, filterState: "neutral" as const }];
      return setExclusiveChannelFilter(allChannels, channelId);
    });

    toast(t("toasts.success.showingOnlyTag", { tag: normalizedTag }));
  }, [bumpChannelFrecency, channels, setPostedTags, t]);

  const handlePersonToggle = useCallback((id: string) => {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id ? { ...person, isSelected: !person.isSelected } : person
      )
    );
  }, [setPeople]);

  const handlePersonExclusive = useCallback((id: string) => {
    if (shouldToggleOffExclusivePerson(people, id)) {
      setPeople((prev) => mapPeopleSelection(prev, () => false));
      return;
    }

    setPeople((prev) => mapPeopleSelection(prev, (person) => person.id === id));
    const person = people.find((entry) => entry.id === id);
    toast(
      t("toasts.success.showingOnlyPerson", {
        personName: person?.displayName || person?.name || t("toasts.success.selectedUserFallback"),
      })
    );
  }, [people, setPeople, t]);

  const upsertAndSelectPerson = useCallback((author: Person) => {
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
  }, [setPeople]);

  const handleAuthorClick = useCallback((author: Person) => {
    upsertAndSelectPerson(author);
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
  }, [isMobile, setSearchQuery, t, upsertAndSelectPerson]);

  const handleToggleAllPeople = useCallback(() => {
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
  }, [setPeople, sidebarPeople, t]);

  const resetFiltersToDefault = useCallback(() => {
    setActiveRelayIds(new Set(relays.map((relay) => relay.id)));
    setChannelFilterStates(() => setAllChannelFilters(channels, "neutral"));
    setChannelMatchMode("and");
    setPeople((prev) => mapPeopleSelection(prev, () => false));
  }, [channels, relays, setActiveRelayIds, setPeople]);

  return {
    mentionRequest,
    channelFilterStates,
    setChannelFilterStates,
    channelMatchMode,
    setChannelMatchMode,
    composeChannelsWithState,
    handleChannelToggle,
    handleChannelExclusive,
    handleToggleAllChannels,
    handleChannelMatchModeChange,
    handleHashtagExclusive,
    handlePersonToggle,
    handlePersonExclusive,
    handleToggleAllPeople,
    handleAuthorClick,
    resetFiltersToDefault,
  };
}
