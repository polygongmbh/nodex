import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getCompactPersonLabel, type Person } from "@/types/person";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";

interface InteractivePersonNameProps {
  person: Person;
  children: ReactNode;
}

/**
 * Shared interactive author/name button. Single button trigger that opens
 * the action menu on click/tap and shows the hover card on desktop hover.
 * Use this anywhere we render a clickable person name.
 */
export function InteractivePersonName({
  person,
  children,
}: InteractivePersonNameProps) {
  const { t } = useTranslation("tasks");
  const label = t("people.actions.openMenu", { name: getCompactPersonLabel(person) });

  return (
    <PersonHoverCard person={person}>
      <PersonActionMenu person={person} enableModifierShortcuts>
        <button
          type="button"
          className="min-w-0 max-w-full rounded text-left transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label={label}
        >
          {children}
        </button>
      </PersonActionMenu>
    </PersonHoverCard>
  );
}
