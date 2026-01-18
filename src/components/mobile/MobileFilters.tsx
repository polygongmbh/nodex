import { Radio, Hash, Users, Check, X, Minus } from "lucide-react";
import { Relay, Tag, Person } from "@/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MobileFiltersProps {
  relays: Relay[];
  tags: Tag[];
  people: Person[];
  onRelayToggle: (id: string) => void;
  onTagToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
}

export function MobileFilters({
  relays,
  tags,
  people,
  onRelayToggle,
  onTagToggle,
  onPersonToggle,
}: MobileFiltersProps) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-6">
        {/* Relays */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Feeds</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {relays.map((relay) => (
              <button
                key={relay.id}
                onClick={() => onRelayToggle(relay.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border",
                  relay.isActive
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                <span className="text-base">{relay.icon}</span>
                {relay.name}
                {relay.isActive && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </section>

        {/* Tags */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Tags</h2>
            <span className="text-xs text-muted-foreground ml-1">Tap to cycle: neutral → include → exclude</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => onTagToggle(tag.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors border",
                  tag.filterState === "included" && "bg-success/10 border-success text-success",
                  tag.filterState === "excluded" && "bg-destructive/10 border-destructive text-destructive",
                  tag.filterState === "neutral" && "border-border hover:bg-muted"
                )}
              >
                #{tag.name}
                {tag.filterState === "included" && <Check className="w-3 h-3" />}
                {tag.filterState === "excluded" && <X className="w-3 h-3" />}
                {tag.filterState === "neutral" && <Minus className="w-3 h-3 opacity-50" />}
              </button>
            ))}
          </div>
        </section>

        {/* People */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">People</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <button
                key={person.id}
                onClick={() => onPersonToggle(person.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border",
                  person.isSelected
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                <img
                  src={person.avatar}
                  alt={person.name}
                  className="w-5 h-5 rounded-full"
                />
                {person.name}
                {person.isSelected && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
