import { useState, useEffect, useMemo } from "react";
import { Hash, Users } from "lucide-react";
import {   Relay, Channel, ChannelMatchMode, Post, QuickFilterState, SavedFilterConfiguration } from "@/types";
import type { SelectablePerson } from "@/types/person";
import { ChannelItem } from "./sidebar/ChannelItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";
import { SidebarInset } from "./sidebar/SidebarInset";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import { SidebarProjectsSection } from "./sidebar/SidebarProjectsSection";
import { SidebarRelaysSection } from "./sidebar/SidebarRelaysSection";
import { useSidebarKeyboardNav, type SidebarFocusableItem } from "./sidebar/use-sidebar-keyboard-nav";
import { SavedFilterPresetRow } from "@/components/tasks/SavedFilterPresetRow";
import { SidebarQuickConstraintRow } from "@/components/tasks/SidebarQuickConstraintRow";
import { ChannelMatchModeToggle } from "@/components/filters/ChannelMatchModeToggle";
import { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import { cn } from "@/lib/utils";
import { buildCollapsedPreviewItems, getCollapsedPreviewMaxItems } from "@/lib/sidebar-collapsed-preview";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { useCoreChannels } from "@/lib/use-core-channels";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

const DEFAULT_EXPANDED_SECTIONS = {
  projects: true,
  feeds: true,
  channels: false,
  people: false,
};

let sidebarExpandedSectionsSnapshot = DEFAULT_EXPANDED_SECTIONS;

export interface SidebarProps {
  relays: Relay[];
  channels: Channel[];
  collapsedPreviewChannels?: Channel[];
  channelMatchMode?: ChannelMatchMode;
  people: SelectablePerson[];
  collapsedPreviewPeople?: SelectablePerson[];
  pinnedPersonIds?: string[];
  nostrRelays: NDKRelayStatus[];
  isFocused?: boolean;
  quickFilters?: QuickFilterState;
  savedFilterConfigurations?: SavedFilterConfiguration[];
  activeSavedFilterConfigurationId?: string | null;
  /** Relay-scoped posts feeding the Projects section; omitted on mobile. */
  posts?: Post[];
  focusedTaskId?: string | null;
}

export function Sidebar({
  relays,
  channels,
  collapsedPreviewChannels,
  channelMatchMode = "and",
  people,
  collapsedPreviewPeople,
  pinnedPersonIds = [],
  nostrRelays,
  isFocused = false,
  quickFilters,
  savedFilterConfigurations = [],
  activeSavedFilterConfigurationId = null,
  posts = [],
  focusedTaskId = null,
}: SidebarProps) {
  // Membership-only check; pin order is already baked into `people`.
  const pinnedPersonIdSet = useMemo(
    () => new Set(pinnedPersonIds.map((id) => id.trim().toLowerCase())),
    [pinnedPersonIds],
  );
  const isPersonPinned = (pubkey: string) =>
    pinnedPersonIdSet.has(pubkey.trim().toLowerCase());
  const selectedPubkeys = useFilterStore((s) => s.selectedPubkeys);
  const { t } = useTranslation("shell");
  const { isCore } = useCoreChannels();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [expandedSections, setExpandedSections] = useState(() => sidebarExpandedSectionsSnapshot);
  const [screenHeight, setScreenHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight
  );

  useEffect(() => {
    sidebarExpandedSectionsSnapshot = expandedSections;
  }, [expandedSections]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncScreenHeight = () => {
      setScreenHeight(window.innerHeight);
    };

    syncScreenHeight();
    window.addEventListener("resize", syncScreenHeight);
    return () => window.removeEventListener("resize", syncScreenHeight);
  }, []);

  const collapsedPreviewLimit = useMemo(
    () => getCollapsedPreviewMaxItems(screenHeight),
    [screenHeight]
  );

  const hasActiveChannelFilters = useMemo(
    () => channels.some((channel) => channel.filterState !== "neutral"),
    [channels]
  );
  const hasActivePeopleFilters = selectedPubkeys.size > 0;

  const collapsedPreviewChannelIds = useMemo(
    () =>
      new Set(
        buildCollapsedPreviewItems({
          items: [...(collapsedPreviewChannels ?? channels)].sort((a, b) => {
            const usageDiff = (b.usageCount ?? 0) - (a.usageCount ?? 0);
            if (usageDiff !== 0) return usageDiff;
            return a.name.localeCompare(b.name);
          }),
          isSelected: (channel) => channel.filterState !== "neutral",
          isPinned: (channel) => channel.pinIndex !== undefined,
          maxItems: collapsedPreviewLimit,
          alwaysIncludePinned: true,
          isAlwaysIncluded: (channel) => isCore(channel.name),
        }).map((channel) => channel.id)
      ),
    [channels, collapsedPreviewChannels, collapsedPreviewLimit, isCore]
  );
  const collapsedPreviewPersonIds = useMemo(
    () =>
      new Set(
        buildCollapsedPreviewItems({
          items: collapsedPreviewPeople ?? people,
          isSelected: (person) => selectedPubkeys.has(person.pubkey.trim().toLowerCase()),
          isPinned: (person) => pinnedPersonIdSet.has(person.pubkey.trim().toLowerCase()),
          maxItems: collapsedPreviewLimit,
          alwaysIncludePinned: true,
        }).map((person) => person.pubkey)
      ),
    [collapsedPreviewLimit, collapsedPreviewPeople, people, pinnedPersonIdSet, selectedPubkeys]
  );

  // Flat list of all focusable items — computed once per relevant input
  // change instead of allocating fresh on every call. Three callers
  // (keyboard handler, scroll effect, focused-item read) each used to
  // produce their own copy per render.
  const focusableItems = useMemo<SidebarFocusableItem[]>(() => {
    const items: SidebarFocusableItem[] = [];
    if (expandedSections.feeds) {
      for (const r of relays) items.push({ type: 'relay', id: r.id });
    }
    if (expandedSections.channels) {
      for (const c of channels) items.push({ type: 'channel', id: c.id });
    } else {
      for (const channel of channels) {
        if (collapsedPreviewChannelIds.has(channel.id)) items.push({ type: 'channel', id: channel.id });
      }
    }
    if (expandedSections.people) {
      for (const p of people) items.push({ type: 'person', id: p.pubkey });
    } else {
      for (const person of people) {
        if (collapsedPreviewPersonIds.has(person.pubkey)) items.push({ type: 'person', id: person.pubkey });
      }
    }
    return items;
  }, [relays, channels, people, expandedSections, collapsedPreviewChannelIds, collapsedPreviewPersonIds]);

  const { focusedItem, sidebarRef } = useSidebarKeyboardNav({ isFocused, focusableItems });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((previous) => ({
      ...previous,
      [section]: !previous[section],
    }));
  };

  return (
    <aside 
      ref={sidebarRef}
      className={cn(
        "w-44 lg:w-56 xl:w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden flex-shrink-0",
        isFocused && "ring-2 ring-primary/30 ring-inset"
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        <SidebarInset>
          <SavedFilterPresetRow
            configurations={savedFilterConfigurations}
            activeConfigurationId={activeSavedFilterConfigurationId}
          />
          {quickFilters && (
            <SidebarQuickConstraintRow
              quickFilters={quickFilters}
              className={savedFilterConfigurations.length > 0 ? "pt-1" : undefined}
            />
          )}
        </SidebarInset>
        <SidebarProjectsSection
          posts={posts}
          focusedTaskId={focusedTaskId}
          isExpanded={expandedSections.projects}
          onToggle={() => toggleSection("projects")}
        />
        <SidebarRelaysSection
          relays={relays}
          nostrRelays={nostrRelays}
          isExpanded={expandedSections.feeds}
          onToggle={() => toggleSection("feeds")}
          focusedItem={focusedItem}
        />

        {/* Channels */}
        <SidebarSection
          dataOnboarding="channels-section"
          title={t("sidebar.sections.channels")}
          icon={Hash}
          isExpanded={expandedSections.channels}
          onToggle={() => toggleSection("channels")}
          toggleLabel={
            expandedSections.channels
              ? t("sidebar.actions.hideChannels")
              : t("sidebar.actions.showAllChannels")
          }
          onIconClick={() => {
            if (hasActiveChannelFilters) {
              void dispatchFeedInteraction({ type: "sidebar.channel.toggleAll" });
              return;
            }
            toggleSection("channels");
          }}
          iconLabel={
            hasActiveChannelFilters
              ? t("sidebar.actions.clearChannelFilters")
              : expandedSections.channels
                ? t("sidebar.actions.hideChannels")
                : t("sidebar.actions.showAllChannels")
          }
          action={
            <ChannelMatchModeToggle
              mode={channelMatchMode}
              size="sidebar"
              className="ml-1 mr-1"
            />
          }
        >
          {channels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isPinned={channel.pinIndex !== undefined}
              isKeyboardFocused={focusedItem?.type === 'channel' && focusedItem?.id === channel.id}
              className={!expandedSections.channels && !collapsedPreviewChannelIds.has(channel.id) ? "hidden" : undefined}
            />
          ))}
        </SidebarSection>

        {/* People */}
        <SidebarSection
          dataOnboarding="people-section"
          title={t("sidebar.sections.people")}
          icon={Users}
          isExpanded={expandedSections.people}
          onToggle={() => toggleSection("people")}
          toggleLabel={
            expandedSections.people
              ? t("sidebar.actions.hidePeople")
              : t("sidebar.actions.showAllPeople")
          }
          onIconClick={() => {
            if (hasActivePeopleFilters) {
              void dispatchFeedInteraction({ type: "sidebar.person.toggleAll" });
              return;
            }
            toggleSection("people");
          }}
          iconLabel={
            hasActivePeopleFilters
              ? t("sidebar.actions.clearPeopleFilters")
              : expandedSections.people
                ? t("sidebar.actions.hidePeople")
                : t("sidebar.actions.showAllPeople")
          }
        >
          {people.map((person) => (
            <PersonItem
              key={person.pubkey}
              person={person}
              isPinned={isPersonPinned(person.pubkey)}
              isKeyboardFocused={focusedItem?.type === 'person' && focusedItem?.id === person.pubkey}
              className={!expandedSections.people && !collapsedPreviewPersonIds.has(person.pubkey) ? "hidden" : undefined}
            />
          ))}
        </SidebarSection>
      </nav>

      <SidebarFooter />
    </aside>
  );
}
