import { cn } from "@/lib/utils";
import { Person } from "@/types";
import { UserAvatar } from "@/components/ui/user-avatar";

interface PersonItemProps {
  person: Person;
  onToggle: () => void;
  onExclusive: () => void;
  isKeyboardFocused?: boolean;
}

export function PersonItem({ person, onToggle, onExclusive, isKeyboardFocused = false }: PersonItemProps) {
  const personName = person.id === "me" ? "Me" : person.displayName;

  return (
    <div
      data-sidebar-item={`person-${person.id}`}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-1.5 pl-7 transition-all group hover:bg-sidebar-accent/50",
        person.isSelected && "bg-sidebar-accent/80 border-l-2 border-l-primary pl-[1.625rem]",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-sidebar-accent"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={`Toggle ${personName}`}
        aria-label={`Toggle ${personName}`}
        className="relative rounded-full hover:ring-2 hover:ring-primary/50"
      >
        <UserAvatar
          id={person.id}
          displayName={person.displayName}
          avatarUrl={person.avatar}
          className={cn(
            "w-7 h-7 transition-colors",
            person.isSelected
              ? "ring-2 ring-primary/50"
              : "group-hover:opacity-90"
          )}
          beamTestId={`sidebar-person-beam-${person.id}`}
        />
        {person.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-sidebar" />
        )}
      </button>
      <button
        onClick={onExclusive}
        className="flex-1 text-left"
        aria-label={`Show only ${personName}`}
        title={`Show only ${personName}`}
      >
        <span
          className={cn(
            "text-sm transition-colors",
            person.isSelected ? "text-foreground font-semibold" : "text-sidebar-foreground hover:text-primary"
          )}
        >
          {personName}
        </span>
      </button>
      {person.isSelected && (
        <div
          className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"
          aria-label={`${personName} selected`}
        />
      )}
    </div>
  );
}
