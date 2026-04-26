import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Person } from "@/types/person";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";
import { cn } from "@/lib/utils";

interface InteractivePersonNameProps {
  person: Person;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  enableModifierShortcuts?: boolean;
  displayName?: string;
  testId?: string;
}

/**
 * Shared interactive author/name button. Single button trigger that opens
 * the action menu on click/tap and shows the hover card on desktop hover.
 * Use this anywhere we render a clickable person name.
 */
export function InteractivePersonName({
  person,
  children,
  className,
  ariaLabel,
  enableModifierShortcuts = true,
  displayName,
  testId,
}: InteractivePersonNameProps) {
  const { t } = useTranslation("tasks");
  const resolvedDisplayName = displayName ?? person.displayName ?? person.name ?? person.id;
  const label = ariaLabel ?? t("people.actions.openMenu", { name: resolvedDisplayName });

  return (
    <PersonHoverCard person={person}>
      <PersonActionMenu person={person} enableModifierShortcuts={enableModifierShortcuts}>
        <button
          type="button"
          className={cn(
            "rounded focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-0",
            className,
          )}
          aria-label={label}
          data-testid={testId}
        >
          {children}
        </button>
      </PersonActionMenu>
    </PersonHoverCard>
  );
}
