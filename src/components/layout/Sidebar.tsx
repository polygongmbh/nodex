import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Radio, Hash, Users, Plus, Keyboard, BookOpen } from "lucide-react";
import { Relay, Channel, ChannelMatchMode, Person, SavedFilterController } from "@/types";
import { RelayItem } from "./sidebar/RelayItem";
import { ChannelItem } from "./sidebar/ChannelItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";
import { SavedFilterPresetRow } from "@/components/tasks/SavedFilterPresetRow";
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
  const { t } = useTranslation();
  const appVersionHint = `Nodex v${APP_VERSION || "0.0.0"}`;

  return (
    <div className={cn("w-36 sm:w-44 lg:w-64 overflow-hidden px-2 sm:px-3 lg:px-4 border-b border-sidebar-border flex items-center flex-shrink-0", className)}>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 xl:w-10 xl:h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-5 xl:h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <a
            href="/"
            title={appVersionHint}
            aria-label="Nodex"
            className="inline-flex items-center font-heading font-semibold text-foreground truncate text-xs sm:text-sm xl:text-lg hover:text-primary transition-colors"
          >
            Nodex
          </a>
          <p className="text-xs text-muted-foreground truncate hidden lg:block">{t("sidebar.tagline")}</p>
        </div>
      </div>
    </div>
  );
}

interface SidebarProps {
  relays: Relay[];
  channels: Channel[];
  channelMatchMode?: ChannelMatchMode;
  people: Person[];
  nostrRelays: NDKRelayStatus[];
  onRelayToggle: (id: string) => void;
  onRelayExclusive: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onChannelExclusive: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onPersonExclusive: (id: string) => void;
  onToggleAllRelays: () => void;
  onToggleAllChannels: () => void;
  onChannelMatchModeChange?: (mode: ChannelMatchMode) => void;
  onToggleAllPeople: () => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onReconnectRelay?: (url: string) => void;
  isFocused?: boolean;
  onFocusTasks?: () => void;
  onShortcutsClick?: () => void;
  onGuideClick?: () => void;
  savedFilters?: SavedFilterController;
  pinnedChannelIds?: string[];
  onChannelPin?: (id: string) => void;
  onChannelUnpin?: (id: string) => void;
}

export function Sidebar({
  relays,
  channels,
  channelMatchMode = "and",
  people,
  nostrRelays,
  onRelayToggle,
  onRelayExclusive,
  onChannelToggle,
  onChannelExclusive,
  onPersonToggle,
  onPersonExclusive,
  onToggleAllRelays,
  onToggleAllChannels,
  onChannelMatchModeChange = () => {},
  onToggleAllPeople,
  onAddRelay,
  onRemoveRelay,
  onReconnectRelay,
  isFocused = false,
  onFocusTasks,
  onShortcutsClick,
  onGuideClick,
  savedFilters,
  pinnedChannelIds = [],
  onChannelPin,
  onChannelUnpin,
}: SidebarProps) {
  const { t } = useTranslation();
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

  const pinnedChannelSet = useMemo(() => new Set(pinnedChannelIds), [pinnedChannelIds]);

  const collapsedPreviewChannelIds = useMemo(
    () =>
      new Set(
        buildCollapsedPreviewItems(
          {
            items: [...channels].sort((a, b) => {
              const usageDiff = (b.usageCount ?? 0) - (a.usageCount ?? 0);
              if (usageDiff !== 0) return usageDiff;
              return a.name.localeCompare(b.name);
            }),
            isSelected: (channel) => channel.filterState !== "neutral",
            isPinned: (channel) => pinnedChannelSet.has(channel.id),
            maxItems: collapsedPreviewLimit,
            alwaysIncludePinned: true,
          }
        ).map((channel) => channel.id)
      ),
    [channels, collapsedPreviewLimit, pinnedChannelSet]
  );
  const collapsedPreviewPersonIds = useMemo(
    () =>
      new Set(
        buildCollapsedPreviewItems({
          items: people,
          isSelected: (person) => person.isSelected,
          maxItems: collapsedPreviewLimit,
        }).map((person) => person.id)
      ),
    [collapsedPreviewLimit, people]
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
      people.forEach(p => items.push({ type: 'person', id: p.id }));
    } else {
      people
        .filter((person) => collapsedPreviewPersonIds.has(person.id))
        .forEach((person) => items.push({ type: "person", id: person.id }));
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
        onFocusTasks?.();
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
          if (item.type === 'relay') onRelayToggle(item.id);
          else if (item.type === 'channel') onChannelToggle(item.id);
          else if (item.type === 'person') onPersonToggle(item.id);
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
        onFocusTasks?.();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocused, focusedItemIndex, getFocusableItems, onFocusTasks, onRelayToggle, onChannelToggle, onPersonToggle]);

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
        "w-36 sm:w-44 lg:w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden flex-shrink-0",
        isFocused && "ring-2 ring-primary/30 ring-inset"
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-1.5 pb-3">
        {savedFilters && (
          <div className="px-2 sm:px-2.5 lg:px-3 pb-2">
            <SavedFilterPresetRow savedFilters={savedFilters} />
          </div>
        )}
        {/* Feeds/Relays */}
        <div data-onboarding="relays-section">
        <SidebarSection
          title={t("sidebar.sections.feeds")}
          icon={Radio}
          isExpanded={expandedSections.feeds}
          animationMode="fullCollapse"
          onToggle={() => toggleSection("feeds")}
          onIconClick={onToggleAllRelays}
          hint={t("sidebar.hints.relays")}
          action={
            <TooltipProvider>
              <Tooltip>
                <RelayManagement
                  relays={nostrRelays}
                  onAddRelay={onAddRelay}
                  onRemoveRelay={onRemoveRelay}
                  onReconnectRelay={onReconnectRelay}
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
              onToggle={() => onRelayToggle(relay.id)}
              onExclusive={() => onRelayExclusive(relay.id)}
              isKeyboardFocused={focusedItem?.type === 'relay' && focusedItem?.id === relay.id}
            />
          ))}
        </SidebarSection>
        </div>

        {/* Channels */}
        <div data-onboarding="channels-section">
        <SidebarSection
          title={t("sidebar.sections.channels")}
          icon={Hash}
          isExpanded={expandedSections.channels}
          onToggle={() => toggleSection("channels")}
          onIconClick={onToggleAllChannels}
          action={
            <ChannelMatchModeToggle
              mode={channelMatchMode}
              onChange={onChannelMatchModeChange}
              size="sidebar"
              className="ml-1 mr-1"
            />
          }
        >
          {channels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              onToggle={() => onChannelToggle(channel.id)}
              onExclusive={() => onChannelExclusive(channel.id)}
              isPinned={pinnedChannelSet.has(channel.id)}
              onPin={onChannelPin ? () => onChannelPin(channel.id) : undefined}
              onUnpin={onChannelUnpin ? () => onChannelUnpin(channel.id) : undefined}
              isKeyboardFocused={focusedItem?.type === 'channel' && focusedItem?.id === channel.id}
              className={!expandedSections.channels && !collapsedPreviewChannelIds.has(channel.id) ? "hidden" : undefined}
            />
          ))}
        </SidebarSection>
        </div>

        {/* People */}
        <div data-onboarding="people-section">
        <SidebarSection
          title={t("sidebar.sections.people")}
          icon={Users}
          isExpanded={expandedSections.people}
          onToggle={() => toggleSection("people")}
          onIconClick={onToggleAllPeople}
        >
          {people.map((person) => (
            <PersonItem
              key={person.id}
              person={person}
              onToggle={() => onPersonToggle(person.id)}
              onExclusive={() => onPersonExclusive(person.id)}
              isKeyboardFocused={focusedItem?.type === 'person' && focusedItem?.id === person.id}
              className={!expandedSections.people && !collapsedPreviewPersonIds.has(person.id) ? "hidden" : undefined}
            />
          ))}
        </SidebarSection>
        </div>
      </nav>

      {/* Footer: utility tiles */}
      <div className="border-t border-sidebar-border flex-shrink-0 p-2">
        {(onShortcutsClick || onGuideClick) && (
          <div className="flex w-full flex-col gap-1 lg:flex-row lg:gap-2">
            {onShortcutsClick && (
              <button
                onClick={onShortcutsClick}
                className="hidden h-8 w-full items-center justify-start gap-2 rounded-none bg-transparent px-1.5 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex lg:w-auto lg:flex-1"
                aria-label={t("sidebar.actions.openShortcuts")}
              >
                <Keyboard className="w-4 h-4" />
                <span className="text-xs font-medium">{t("sidebar.actions.shortcuts")}</span>
              </button>
            )}

            {onGuideClick && (
              <button
                onClick={onGuideClick}
                className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-none bg-transparent px-1.5 text-muted-foreground transition-colors hover:text-foreground lg:w-auto lg:flex-1"
                aria-label={t("sidebar.actions.openGuide")}
              >
                <BookOpen className="w-4 h-4" />
                <span className="text-xs font-medium">{t("sidebar.actions.guide")}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
