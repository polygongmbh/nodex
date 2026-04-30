import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Radio, Hash, Users, Plus, Keyboard, BookOpen } from "lucide-react";
import {   Relay, Channel, ChannelMatchMode, QuickFilterState, SavedFilterConfiguration } from "@/types";
import type { SidebarPerson } from "@/types/person";
import { RelayItem } from "./sidebar/RelayItem";
import { ChannelItem } from "./sidebar/ChannelItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";
import { SidebarInset } from "./sidebar/SidebarInset";
import { SavedFilterPresetRow } from "@/components/tasks/SavedFilterPresetRow";
import { SidebarQuickConstraintRow } from "@/components/tasks/SidebarQuickConstraintRow";
import { ChannelMatchModeToggle } from "@/components/filters/ChannelMatchModeToggle";
import { RelayManagement } from "@/components/relay/RelayManagement";
import { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";
import { buildCollapsedPreviewItems, getCollapsedPreviewMaxItems } from "@/lib/sidebar-collapsed-preview";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

const DEFAULT_EXPANDED_SECTIONS = {
  feeds: true,
  channels: false,
  people: false,
};

let sidebarExpandedSectionsSnapshot = DEFAULT_EXPANDED_SECTIONS;

interface SidebarHeaderProps {
  className?: string;
}

export function SidebarHeader({ className }: SidebarHeaderProps) {
  const { t } = useTranslation("shell");
  const appVersionHint = `Nodex v${APP_VERSION || "0.0.0"}`;

  return (
    <div className={cn("w-44 lg:w-56 xl:w-64 overflow-hidden px-3 lg:px-4 border-b border-sidebar-border flex items-center flex-shrink-0", className)}>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="w-8 h-8 xl:w-10 xl:h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Radio className="w-4 h-4 xl:w-5 xl:h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <a
            href="/"
            title={appVersionHint}
            aria-label="Nodex"
            className="inline-flex items-center font-heading font-semibold text-foreground truncate text-sm xl:text-lg hover:text-primary transition-colors"
          >
            Nodex
          </a>
          <p className="text-xs text-muted-foreground truncate hidden lg:block">{t("sidebar.tagline")}</p>
        </div>
      </div>
    </div>
  );
}

export interface SidebarProps {
  relays: Relay[];
  channels: Channel[];
  collapsedPreviewChannels?: Channel[];
  pinnedChannelIds?: string[];
  channelMatchMode?: ChannelMatchMode;
  people: SidebarPerson[];
  collapsedPreviewPeople?: SidebarPerson[];
  nostrRelays: NDKRelayStatus[];
  isFocused?: boolean;
  quickFilters?: QuickFilterState;
  savedFilterConfigurations?: SavedFilterConfiguration[];
  activeSavedFilterConfigurationId?: string | null;
}

export function Sidebar({
  relays,
  channels,
  collapsedPreviewChannels,
  pinnedChannelIds,
  channelMatchMode = "and",
  people,
  collapsedPreviewPeople,
  nostrRelays,
  isFocused = false,
  quickFilters,
  savedFilterConfigurations = [],
  activeSavedFilterConfigurationId = null,
}: SidebarProps) {
  const { t } = useTranslation("shell");
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
  const hasActivePeopleFilters = useMemo(
    () => people.some((person) => person.isSelected),
    [people]
  );

  const collapsedPreviewChannelIds = useMemo(
    () =>
      new Set(
        buildCollapsedPreviewItems(
          {
            items: [...(collapsedPreviewChannels ?? channels)].map((channel) => ({
              ...channel,
              pinIndex:
                channel.pinIndex ??
                (pinnedChannelIds ? pinnedChannelIds.indexOf(channel.id) : -1) >= 0
                  ? pinnedChannelIds?.indexOf(channel.id)
                  : undefined,
            })).sort((a, b) => {
              const usageDiff = (b.usageCount ?? 0) - (a.usageCount ?? 0);
              if (usageDiff !== 0) return usageDiff;
              return a.name.localeCompare(b.name);
            }),
            isSelected: (channel) => channel.filterState !== "neutral",
            isPinned: (channel) => channel.pinIndex !== undefined,
            maxItems: collapsedPreviewLimit,
            alwaysIncludePinned: true,
          }
        ).map((channel) => channel.id)
      ),
    [channels, collapsedPreviewChannels, collapsedPreviewLimit, pinnedChannelIds]
  );
  const collapsedPreviewPersonIds = useMemo(
    () =>
      new Set(
        buildCollapsedPreviewItems({
          items: collapsedPreviewPeople ?? people,
          isSelected: (person) => person.isSelected,
          isPinned: (person) => person.pinIndex !== undefined,
          maxItems: collapsedPreviewLimit,
          alwaysIncludePinned: true,
        }).map((person) => person.pubkey)
      ),
    [collapsedPreviewLimit, collapsedPreviewPeople, people]
  );

  // Build a flat list of all focusable items
  const getFocusableItems = useCallback(() => {
    const items: { type: 'relay' | 'channel' | 'person'; id: string }[] = [];
    if (expandedSections.feeds) {
      relays.forEach(r => items.push({ type: 'relay', id: r.id }));
    }
    if (expandedSections.channels) {
      channels.forEach(c => items.push({ type: 'channel', id: c.id }));
    } else {
      channels
        .filter((channel) => collapsedPreviewChannelIds.has(channel.id))
        .forEach((channel) => items.push({ type: "channel", id: channel.id }));
    }
    if (expandedSections.people) {
      people.forEach(p => items.push({ type: 'person', id: p.pubkey }));
    } else {
      people
        .filter((person) => collapsedPreviewPersonIds.has(person.pubkey))
        .forEach((person) => items.push({ type: "person", id: person.pubkey }));
    }
    return items;
  }, [relays, channels, people, expandedSections, collapsedPreviewChannelIds, collapsedPreviewPersonIds]);

  const [focusedItemIndex, setFocusedItemIndex] = useState(0);
  const sidebarRef = useRef<HTMLElement>(null);

  // Reset focus index when sidebar becomes focused
  useEffect(() => {
    if (isFocused) {
      setFocusedItemIndex(0);
    }
  }, [isFocused]);

  // Keyboard handler for sidebar navigation
  useEffect(() => {
    if (!isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const items = getFocusableItems();
      const key = e.key.toLowerCase();

      // L or ArrowRight or Enter - return focus to tasks
      if (key === "l" || e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        void dispatchFeedInteraction({ type: "ui.focusTasks" });
        return;
      }

      // J or ArrowDown - move down
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedItemIndex(prev => Math.min(prev + 1, items.length - 1));
        return;
      }

      // K or ArrowUp - move up
      if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedItemIndex(prev => Math.max(prev - 1, 0));
        return;
      }

      // Space - toggle current item
      if (e.key === " ") {
        e.preventDefault();
        const item = items[focusedItemIndex];
        if (item) {
          if (item.type === "relay") {
            void dispatchFeedInteraction({ type: "sidebar.relay.toggle", relayId: item.id });
          } else if (item.type === "channel") {
            void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: item.id });
          } else if (item.type === "person") {
            void dispatchFeedInteraction({ type: "sidebar.person.toggle", personId: item.id });
          }
        }
        return;
      }

      // G - go to top
      if (key === "g" && !e.shiftKey) {
        e.preventDefault();
        setFocusedItemIndex(0);
        return;
      }

      // Shift+G - go to bottom
      if (e.shiftKey && e.key === "G") {
        e.preventDefault();
        setFocusedItemIndex(items.length - 1);
        return;
      }

      // Escape - return to tasks
      if (e.key === "Escape") {
        void dispatchFeedInteraction({ type: "ui.focusTasks" });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocused, focusedItemIndex, getFocusableItems, dispatchFeedInteraction]);

  // Scroll focused item into view
  useEffect(() => {
    if (isFocused && sidebarRef.current) {
      const items = getFocusableItems();
      const item = items[focusedItemIndex];
      if (item) {
        const element = sidebarRef.current.querySelector(`[data-sidebar-item="${item.type}-${item.id}"]`);
        if (element) {
          element.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  }, [isFocused, focusedItemIndex, getFocusableItems]);

  // Get current focused item info
  const focusedItem = isFocused ? getFocusableItems()[focusedItemIndex] : null;

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
        {/* Feeds/Relays */}
        <SidebarSection
          dataOnboarding="relays-section"
          title={t("sidebar.sections.feeds")}
          icon={Radio}
          isExpanded={expandedSections.feeds}
          animationMode="fullCollapse"
          onToggle={() => toggleSection("feeds")}
          iconIntent="sidebar.relay.toggleAll"
          iconLabel={t("sidebar.actions.toggleAllConnectedSpaces")}
          hint={t("sidebar.hints.relays")}
          action={
            <TooltipProvider>
              <Tooltip>
                <RelayManagement
                  relays={nostrRelays}
                  trigger={
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                        aria-label={t("sidebar.actions.addRelay")}
                        title={t("sidebar.actions.addRelay")}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                  }
                />
                <TooltipContent side="right">
                  <p>{t("sidebar.actions.addRelay")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
        >
          {relays.map((relay) => (
            <RelayItem
              key={relay.id}
              relay={relay}
              isKeyboardFocused={focusedItem?.type === 'relay' && focusedItem?.id === relay.id}
            />
          ))}
        </SidebarSection>

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
              isPinned={person.pinIndex !== undefined}
              isKeyboardFocused={focusedItem?.type === 'person' && focusedItem?.id === person.pubkey}
              className={!expandedSections.people && !collapsedPreviewPersonIds.has(person.pubkey) ? "hidden" : undefined}
            />
          ))}
        </SidebarSection>
      </nav>

      {/* Footer: utility tiles */}
      <div className="border-t border-sidebar-border flex-shrink-0 p-2">
        <div className="flex w-full flex-col gap-1 lg:flex-row lg:gap-2">
          <button
            onClick={() => {
              void dispatchFeedInteraction({ type: "ui.openShortcutsHelp" });
            }}
            className="hidden h-8 w-full items-center justify-start gap-2 rounded-none bg-transparent px-1.5 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex lg:w-auto lg:flex-1"
            aria-label={t("sidebar.actions.openShortcuts")}
          >
            <Keyboard className="w-4 h-4" />
            <span className="text-xs font-medium">{t("sidebar.actions.shortcuts")}</span>
          </button>

          <button
            onClick={() => {
              void dispatchFeedInteraction({ type: "ui.openGuide" });
            }}
            className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-none bg-transparent px-1.5 text-muted-foreground transition-colors hover:text-foreground lg:w-auto lg:flex-1"
            aria-label={t("sidebar.actions.openGuide")}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-medium">{t("sidebar.actions.guide")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
