import { useState, useEffect, useCallback, useRef } from "react";
import { Radio, Hash, Users } from "lucide-react";
import { Relay, Channel, Person } from "@/types";
import { RelayItem } from "./sidebar/RelayItem";
import { ChannelItem } from "./sidebar/ChannelItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";
import { cn } from "@/lib/utils";

interface SidebarProps {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  onRelayToggle: (id: string) => void;
  onRelayExclusive: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onChannelExclusive: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onToggleAllRelays: () => void;
  onToggleAllChannels: () => void;
  onToggleAllPeople: () => void;
  isFocused?: boolean;
  onFocusTasks?: () => void;
}

export function Sidebar({
  relays,
  channels,
  people,
  onRelayToggle,
  onRelayExclusive,
  onChannelToggle,
  onChannelExclusive,
  onPersonToggle,
  onToggleAllRelays,
  onToggleAllChannels,
  onToggleAllPeople,
  isFocused = false,
  onFocusTasks,
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

  return (
    <aside 
      ref={sidebarRef}
      className={cn(
        "w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden",
        isFocused && "ring-2 ring-primary/30 ring-inset"
      )}
    >
      {/* Logo - height matches view switcher header */}
      <div className="h-14 px-4 border-b border-sidebar-border flex items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading font-semibold text-foreground truncate">Nodex</h1>
            <p className="text-xs text-muted-foreground truncate">Collaboration Platform</p>
          </div>
        </div>
      </div>

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
              isKeyboardFocused={focusedItem?.type === 'person' && focusedItem?.id === person.id}
            />
          ))}
        </SidebarSection>
      </nav>

      {/* Status - height matches search bar footer */}
      <div className="h-12 px-3 border-t border-sidebar-border flex items-center flex-shrink-0">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" aria-hidden="true" />
          <span>Connected to {relays.filter(r => r.isActive).length} relays</span>
        </div>
      </div>
    </aside>
  );
}
