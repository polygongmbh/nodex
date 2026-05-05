import { useTranslation } from "react-i18next";
import type { Person } from "@/types/person";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";
import { cn } from "@/lib/utils";

interface InteractivePersonAvatarProps {
  person: Person;
  /** Tailwind size class applied to the button wrapper (e.g. "w-8 h-8"). */
  sizeClassName?: string;
  /** Extra classes for the outer button wrapper. */
  className?: string;
  /** Optional accessible label override; defaults to the person's name. */
  ariaLabel?: string;
  /** Forwarded to PersonActionMenu. Defaults to true so cmd/alt-clicks dispatch shortcuts. */
  enableModifierShortcuts?: boolean;
  /**
   * When true, a plain click immediately filters the feed by this person
   * (sidebar exclusive selection) instead of opening the action menu.
   * Modifier-key shortcuts still apply. Used everywhere except the desktop
   * timeline, where the menu is the primary affordance.
   */
  directFilterOnClick?: boolean;
}

/**
 * Shared, fully interactive avatar for a person.
 *
 * Owns hover card + action menu + click target as a single button so behavior
 * is identical across feed, tree, kanban, calendar, etc. Size is controlled
 * via `sizeClassName` so each surface can tune its visual scale. The avatar
 * picture itself is resolved by `UserAvatar` from the shared profile cache.
 */
export function InteractivePersonAvatar({
  person,
  sizeClassName = "w-8 h-8",
  className,
  ariaLabel,
  enableModifierShortcuts = true,
  directFilterOnClick = false,
}: InteractivePersonAvatarProps) {
  const { t } = useTranslation("tasks");
  const resolvedDisplayName = person.displayName ?? person.name ?? person.pubkey;
  const label = ariaLabel ?? t("people.actions.openMenu", { name: resolvedDisplayName });

  return (
    <PersonHoverCard person={person} triggerClassName="rounded-full">
      <PersonActionMenu
        person={person}
        enableModifierShortcuts={enableModifierShortcuts}
        directFilterOnClick={directFilterOnClick}
      >
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 hover:ring-2 hover:ring-primary/40 transition-shadow",
            sizeClassName,
            className,
          )}
          aria-label={label}
        >
          <UserAvatar pubkey={person.pubkey} />
        </button>
      </PersonActionMenu>
    </PersonHoverCard>
  );
}
