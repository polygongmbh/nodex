import { useState } from "react";
import { Radio, Hash, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay, Tag, Person } from "@/types";
import { RelayItem } from "./sidebar/RelayItem";
import { TagItem } from "./sidebar/TagItem";
import { PersonItem } from "./sidebar/PersonItem";
import { SidebarSection } from "./sidebar/SidebarSection";

interface SidebarProps {
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  onRelayToggle: (id: string) => void;
  onTagToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
}

export function Sidebar({
  relays,
  tags,
  people,
  onRelayToggle,
  onTagToggle,
  onPersonToggle,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    feeds: true,
    tags: true,
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
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading font-semibold text-foreground">NostrChat</h1>
            <p className="text-xs text-muted-foreground">Decentralized comms</p>
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
          hint="Relays"
        >
          {relays.map((relay) => (
            <RelayItem
              key={relay.id}
              relay={relay}
              onToggle={() => onRelayToggle(relay.id)}
            />
          ))}
        </SidebarSection>

        {/* Tags */}
        <SidebarSection
          title="Tags"
          icon={Hash}
          isExpanded={expandedSections.tags}
          onToggle={() => toggleSection("tags")}
          hint="Click to filter"
        >
          {tags.map((tag) => (
            <TagItem
              key={tag.id}
              tag={tag}
              onToggle={() => onTagToggle(tag.id)}
            />
          ))}
        </SidebarSection>

        {/* People */}
        <SidebarSection
          title="People"
          icon={Users}
          isExpanded={expandedSections.people}
          onToggle={() => toggleSection("people")}
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
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span>Connected to 4 relays</span>
        </div>
      </div>
    </aside>
  );
}
