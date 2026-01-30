import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Person } from "@/types";

interface PersonItemProps {
  person: Person;
  onToggle: () => void;
  isKeyboardFocused?: boolean;
}

export function PersonItem({ person, onToggle, isKeyboardFocused = false }: PersonItemProps) {
  return (
    <button
      onClick={onToggle}
      data-sidebar-item={`person-${person.id}`}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 pl-7 transition-all group hover:bg-sidebar-accent/50",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-sidebar-accent"
      )}
    >
      <div className="relative">
        <div
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
            person.isSelected
              ? "bg-primary/20 ring-2 ring-primary/50"
              : "bg-muted/50 group-hover:bg-muted"
          )}
        >
          <User
            className={cn(
              "w-4 h-4",
              person.isSelected ? "text-primary" : "text-muted-foreground"
            )}
          />
        </div>
        {person.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-sidebar" />
        )}
      </div>
      <span
        className={cn(
          "text-sm transition-colors flex-1 text-left",
          person.isSelected ? "text-foreground font-medium" : "text-sidebar-foreground"
        )}
      >
        {person.id === "me" ? "Me" : person.displayName}
      </span>
    </button>
  );
}
