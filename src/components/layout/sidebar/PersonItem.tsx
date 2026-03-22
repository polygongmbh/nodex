import { cn } from "@/lib/utils";
import { Person } from "@/types";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { SidebarPinButton } from "./SidebarPinButton";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface PersonItemProps {
  person: Person;
  isPinned?: boolean;
  isKeyboardFocused?: boolean;
  className?: string;
}

export function PersonItem({
  person,
  isPinned = false,
  isKeyboardFocused = false,
  className,
}: PersonItemProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const personName = person.id === "me" ? t("sidebar.filters.me") : person.displayName;
  const onlineStatus = person.onlineStatus ?? (person.isOnline ? "online" : "offline");
  const statusDotClassName = onlineStatus === "online" ? "bg-success" : onlineStatus === "recent" ? "bg-warning" : null;

  return (
    <SidebarFilterRow
      itemId={`person-${person.id}`}
      isKeyboardFocused={isKeyboardFocused}
      className={cn(
        "relative gap-3 py-1.5",
        person.isSelected && "bg-sidebar-accent/80 border-l-2 border-l-primary pl-[1.625rem]",
        className
      )}
    >
      <SidebarPinButton
        isPinned={isPinned}
        onClick={(e) => {
          e.stopPropagation();
          void dispatchFeedInteraction(
            isPinned
              ? { type: "sidebar.person.unpin", personId: person.id }
              : { type: "sidebar.person.pin", personId: person.id }
          );
        }}
        title={isPinned
          ? t("sidebar.filters.unpinPersonFromView", { name: personName })
          : t("sidebar.filters.pinPersonToView", { name: personName })}
        ariaLabel={isPinned
          ? t("sidebar.filters.unpinPersonFromView", { name: personName })
          : t("sidebar.filters.pinPersonToView", { name: personName })}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          void dispatchFeedInteraction({ type: "sidebar.person.toggle", personId: person.id });
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
              ? "ring-2 ring-primary/50 motion-filter-pop"
              : "group-hover:opacity-90"
          )}
          beamTestId={`sidebar-person-beam-${person.id}`}
        />
        {statusDotClassName && (
          <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar", statusDotClassName)} />
        )}
      </button>
      <button
        onClick={() => {
          void dispatchFeedInteraction({ type: "sidebar.person.exclusive", personId: person.id });
        }}
        className="flex-1 min-w-0 text-left"
        aria-label={t("sidebar.filters.showOnlyPerson", { name: personName })}
        title={t("sidebar.filters.showOnlyPerson", { name: personName })}
      >
        <span
          className={cn(
            "block truncate text-sm transition-colors",
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
