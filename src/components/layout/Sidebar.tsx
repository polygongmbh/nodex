import { useState } from "react";
import { Radio, Hash, Users } from "lucide-react";
import { Relay, Channel, Person } from "@/types";
import { RelayItem } from "./sidebar/RelayItem";
import { ChannelItem } from "./sidebar/ChannelItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";

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
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    feeds: true,
    channels: true,
    people: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
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
            />
          ))}
        </SidebarSection>
      </nav>

      {/* Status */}
      <div className="p-3 border-t border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" aria-hidden="true" />
          <span>Connected to {relays.filter(r => r.isActive).length} relays</span>
        </div>
      </div>
    </aside>
  );
}
