import { useState, useEffect, useCallback, useRef } from "react";
import { Radio, Hash, Users, Plus, Wifi, WifiOff, Keyboard, BookOpen } from "lucide-react";
import { Relay, Channel, Person } from "@/types";
import { RelayItem } from "./sidebar/RelayItem";
import { ChannelItem } from "./sidebar/ChannelItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";
import { RelayManagement } from "@/components/relay/RelayManagement";
import { NDKRelayStatus } from "@/lib/nostr/ndk-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarHeaderProps {
  className?: string;
}

export function SidebarHeader({ className }: SidebarHeaderProps) {
  return (
    <div className={cn("px-2 sm:px-3 lg:px-4 border-b border-sidebar-border flex items-center flex-shrink-0", className)}>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 xl:w-10 xl:h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 xl:w-5 xl:h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="font-heading font-semibold text-foreground truncate text-xs sm:text-sm xl:text-lg">Nodex</h1>
          <p className="text-xs text-muted-foreground truncate hidden lg:block">Collaboration Platform</p>
        </div>
      </div>
    </div>
  );
}

interface SidebarProps {
  relays: Relay[];
  channels: Channel[];
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
  onToggleAllPeople: () => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  isFocused?: boolean;
  onFocusTasks?: () => void;
  onShortcutsClick?: () => void;
  onGuideClick?: () => void;
}

export function Sidebar({
  relays,
  channels,
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
  onToggleAllPeople,
  onAddRelay,
  onRemoveRelay,
  isFocused = false,
  onFocusTasks,
  onShortcutsClick,
  onGuideClick,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    feeds: true,
    channels: true,
    people: true,
  });

  // Build a flat list of all focusable items
  const getFocusableItems = useCallback(() => {
    const items: { type: 'relay' | 'channel' | 'person'; id: string }[] = [];
    if (expandedSections.feeds) {
      relays.forEach(r => items.push({ type: 'relay', id: r.id }));
    }
    if (expandedSections.channels) {
      channels.forEach(c => items.push({ type: 'channel', id: c.id }));
    }
    if (expandedSections.people) {
      people.forEach(p => items.push({ type: 'person', id: p.id }));
    }
    return items;
  }, [relays, channels, people, expandedSections]);

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
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Connection status
  const connectedCount = nostrRelays.filter((r) => r.status === "connected").length;
  const isConnected = connectedCount > 0;

  return (
    <aside 
      ref={sidebarRef}
      className={cn(
        "w-36 sm:w-44 lg:w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden flex-shrink-0",
        isFocused && "ring-2 ring-primary/30 ring-inset"
      )}
    >
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {/* Feeds/Relays */}
        <SidebarSection
          title="Feeds"
          icon={Radio}
          isExpanded={expandedSections.feeds}
          onToggle={() => toggleSection("feeds")}
          onIconClick={onToggleAllRelays}
          hint="Relays"
          action={
            <TooltipProvider>
              <Tooltip>
                <RelayManagement
                  relays={nostrRelays}
                  onAddRelay={onAddRelay}
                  onRemoveRelay={onRemoveRelay}
                  trigger={
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                  }
                />
                <TooltipContent side="right">
                  <p>Add relay</p>
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

        {/* Channels */}
        <div data-onboarding="channels-section">
        <SidebarSection
          title="Channels"
          icon={Hash}
          isExpanded={expandedSections.channels}
          onToggle={() => toggleSection("channels")}
          onIconClick={onToggleAllChannels}
          hint="Click to filter"
        >
          {channels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              onToggle={() => onChannelToggle(channel.id)}
              onExclusive={() => onChannelExclusive(channel.id)}
              isKeyboardFocused={focusedItem?.type === 'channel' && focusedItem?.id === channel.id}
            />
          ))}
        </SidebarSection>
        </div>

        {/* People */}
        <SidebarSection
          title="People"
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
            />
          ))}
        </SidebarSection>
      </nav>

      {/* Footer: Connection Status + Keyboard Shortcuts */}
      <div className="border-t border-sidebar-border flex-shrink-0">
        <RelayManagement
          relays={nostrRelays}
          onAddRelay={onAddRelay}
          onRemoveRelay={onRemoveRelay}
          trigger={
            <button
              className="w-full h-10 px-3 flex items-center gap-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
              aria-label={isConnected ? `Relay status: ${connectedCount} connected` : "Relay status: disconnected"}
              title={isConnected ? "Manage relay connections and status" : "No connected relays. Open relay management"}
            >
              <div className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                isConnected ? "bg-success animate-pulse" : "bg-muted-foreground"
              )} aria-hidden="true" />
              <span className="flex items-center gap-1.5 truncate">
                {isConnected ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{connectedCount} relay{connectedCount !== 1 ? "s" : ""}</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
                    Disconnected
                  </>
                )}
              </span>
            </button>
          }
        />
        {(onShortcutsClick || onGuideClick) && (
          <div className="grid grid-cols-2">
            {onShortcutsClick && (
              <button
                onClick={onShortcutsClick}
                className="h-9 px-3 flex items-center gap-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-r border-border/60"
                title="Keyboard shortcuts (?)"
                aria-label="Open keyboard shortcuts help"
              >
                <Keyboard className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">Shortcuts</span>
                <kbd className="ml-auto text-[10px] font-mono bg-muted/50 border border-border rounded px-1">?</kbd>
              </button>
            )}
            {onGuideClick && (
              <button
                onClick={onGuideClick}
                className="h-9 px-3 flex items-center gap-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                title="Open onboarding guide"
                aria-label="Open onboarding guide"
              >
                <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">Guide</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
