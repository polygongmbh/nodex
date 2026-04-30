import type { MouseEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarPerson } from "@/types/person";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { SidebarPinButton } from "./SidebarPinButton";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";
import { getPersonShortcutIntent, toPersonShortcutInteraction } from "@/components/people/person-shortcuts";

interface PersonItemProps {
  person: SidebarPerson;
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
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const personName = person.pubkey === "me" ? t("sidebar.filters.me") : person.displayName;
  const onlineStatus = person.presence?.state ?? "offline";
  const statusDotClassName = onlineStatus === "online" ? "bg-success" : onlineStatus === "recent" ? "bg-warning" : null;
  const handlePersonShortcut = (event: MouseEvent, fallback: "toggle" | "exclusive") => {
    const shortcutIntent = getPersonShortcutIntent(event);
    if (shortcutIntent) {
      event.stopPropagation();
      void dispatchFeedInteraction(toPersonShortcutInteraction(person, shortcutIntent));
      return true;
    }
    if (fallback === "toggle") {
      void dispatchFeedInteraction({ type: "sidebar.person.toggle", personId: person.pubkey });
    } else {
      void dispatchFeedInteraction({ type: "sidebar.person.exclusive", personId: person.pubkey });
    }
    return false;
  };

  return (
    <SidebarFilterRow
      itemId={`person-${person.pubkey}`}
      isKeyboardFocused={isKeyboardFocused}
      className={cn(
        "relative gap-3 py-1.5",
        person.isSelected && "bg-sidebar-accent/80 border-l-2 border-l-primary pl-[1.625rem]",
        className
      )}
    >
      <SidebarPinButton
        dataTestId={`person-item-pin-${person.pubkey}`}
        isPinned={isPinned}
        onClick={(e) => {
          e.stopPropagation();
          void dispatchFeedInteraction(
            isPinned
              ? { type: "sidebar.person.unpin", personId: person.pubkey }
              : { type: "sidebar.person.pin", personId: person.pubkey }
          );
        }}
        title={isPinned
          ? t("sidebar.filters.unpinPersonFromView", { name: personName })
          : t("sidebar.filters.pinPersonToView", { name: personName })}
        ariaLabel={isPinned
          ? t("sidebar.filters.unpinPersonFromView", { name: personName })
          : t("sidebar.filters.pinPersonToView", { name: personName })}
      />
      <PersonHoverCard
        person={person}
        side="right"
        triggerClassName="flex-1 min-w-0"
        sideOffset={32}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            data-testid={`person-item-toggle-${person.pubkey}`}
            onClick={(event) => {
              event.stopPropagation();
              handlePersonShortcut(event, "toggle");
            }}
            aria-label={t("sidebar.filters.togglePerson", { name: personName })}
            className="relative rounded-full hover:ring-2 hover:ring-primary/50"
          >
            <UserAvatar
              id={person.pubkey}
              displayName={person.displayName}
              className={cn(
                "w-7 h-7 transition-colors",
                person.isSelected
                  ? "ring-2 ring-primary/50 motion-filter-pop"
                  : "group-hover:opacity-90"
              )}
              beamTestId={`sidebar-person-beam-${person.pubkey}`}
            />
            {statusDotClassName && (
              <div className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar", statusDotClassName)} />
            )}
          </button>
          <button
            data-testid={`person-item-exclusive-${person.pubkey}`}
            onClick={(event) => {
              event.stopPropagation();
              handlePersonShortcut(event, "exclusive");
            }}
            className="flex w-full min-w-0 items-center gap-2 text-left"
            aria-label={t("sidebar.filters.showOnlyPerson", { name: personName })}
          >
            <span
              className={cn(
                "block min-w-0 flex-1 truncate text-sm transition-colors",
                person.isSelected ? "text-foreground font-semibold" : "text-sidebar-foreground hover:text-primary"
              )}
            >
              {personName}
            </span>
            {person.isSelected && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            )}
          </button>
        </div>
      </PersonHoverCard>
      <PersonActionMenu person={person} align="end">
        <button
          type="button"
          data-testid={`person-item-actions-${person.pubkey}`}
          className="rounded p-1 text-sidebar-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sidebar-accent/70 hover:text-foreground"
          aria-label={t("tasks:people.actions.openMenu", { name: personName })}
          title={t("tasks:people.actions.openMenu", { name: personName })}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </PersonActionMenu>
    </SidebarFilterRow>
  );
}
