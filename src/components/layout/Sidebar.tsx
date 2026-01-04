import { useState } from "react";
import { Radio, Hash, Users, Layers } from "lucide-react";
import { Relay, Tag, Person, PostType } from "@/types";
import { RelayItem } from "./sidebar/RelayItem";
import { TagItem } from "./sidebar/TagItem";
import { PersonItem } from "./sidebar/PersonItem";
import { PostTypeItem } from "./sidebar/PostTypeItem";
import { SidebarSection } from "./sidebar/SidebarSection";

const ALL_POST_TYPES: PostType[] = ["message", "task", "event", "offer", "request", "blog"];

interface SidebarProps {
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  activePostTypes: PostType[];
  onRelayToggle: (id: string) => void;
  onRelayExclusive: (id: string) => void;
  onTagToggle: (id: string) => void;
  onTagExclusive: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onPostTypeToggle: (type: PostType) => void;
  onPostTypeExclusive: (type: PostType) => void;
  onToggleAllRelays: () => void;
  onToggleAllTags: () => void;
  onToggleAllPeople: () => void;
  onToggleAllPostTypes: () => void;
}

export function Sidebar({
  relays,
  tags,
  people,
  activePostTypes,
  onRelayToggle,
  onRelayExclusive,
  onTagToggle,
  onTagExclusive,
  onPersonToggle,
  onPostTypeToggle,
  onPostTypeExclusive,
  onToggleAllRelays,
  onToggleAllTags,
  onToggleAllPeople,
  onToggleAllPostTypes,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    feeds: true,
    tags: true,
    people: true,
    postTypes: true,
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

        {/* Post Types */}
        <SidebarSection
          title="Types"
          icon={Layers}
          isExpanded={expandedSections.postTypes}
          onToggle={() => toggleSection("postTypes")}
          onIconClick={onToggleAllPostTypes}
          hint="Post types"
        >
          {ALL_POST_TYPES.map((type) => (
            <PostTypeItem
              key={type}
              type={type}
              isActive={activePostTypes.includes(type)}
              onToggle={() => onPostTypeToggle(type)}
              onExclusive={() => onPostTypeExclusive(type)}
            />
          ))}
        </SidebarSection>

        {/* Tags */}
        <SidebarSection
          title="Tags"
          icon={Hash}
          isExpanded={expandedSections.tags}
          onToggle={() => toggleSection("tags")}
          onIconClick={onToggleAllTags}
          hint="Click to filter"
        >
          {tags.map((tag) => (
            <TagItem
              key={tag.id}
              tag={tag}
              onToggle={() => onTagToggle(tag.id)}
              onExclusive={() => onTagExclusive(tag.id)}
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
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span>Connected to 4 relays</span>
        </div>
      </div>
    </aside>
  );
}
