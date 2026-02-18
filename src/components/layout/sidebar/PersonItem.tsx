import { cn } from "@/lib/utils";
import { Person } from "@/types";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { useTranslation } from "react-i18next";

interface PersonItemProps {
  person: Person;
  onToggle: () => void;
  onExclusive: () => void;
  isKeyboardFocused?: boolean;
}

export function PersonItem({ person, onToggle, onExclusive, isKeyboardFocused = false }: PersonItemProps) {
  const { t } = useTranslation();
  const personName = person.id === "me" ? t("sidebar.filters.me") : person.displayName;
  const onlineStatus = person.onlineStatus ?? (person.isOnline ? "online" : "offline");
  const statusDotClassName = onlineStatus === "online" ? "bg-success" : onlineStatus === "recent" ? "bg-yellow-400" : null;

  return (
    <SidebarFilterRow
      itemId={`person-${person.id}`}
      isKeyboardFocused={isKeyboardFocused}
      className={cn(
        "gap-3 py-1.5",
        person.isSelected && "bg-sidebar-accent/80 border-l-2 border-l-primary pl-[1.625rem]"
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={t("sidebar.filters.togglePerson", { name: personName })}
        aria-label={t("sidebar.filters.togglePerson", { name: personName })}
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
        {statusDotClassName && (
          <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar", statusDotClassName)} />
        )}
      </button>
      <button
        onClick={onExclusive}
        className="flex-1 text-left"
        aria-label={t("sidebar.filters.showOnlyPerson", { name: personName })}
        title={t("sidebar.filters.showOnlyPerson", { name: personName })}
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
          aria-label={t("sidebar.filters.selected", { name: personName })}
        />
      )}
    </SidebarFilterRow>
  );
}
