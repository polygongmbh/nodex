import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck } from "lucide-react";
import {
  formatAuthorMetaParts,
  getCompactPersonLabel,
  type Person,
} from "@/types/person";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";
import { useNip05VerifiedPubkeys } from "@/lib/nostr/use-nip05-verified-pubkeys";
import { cn } from "@/lib/utils";

interface InteractivePersonNameProps {
  person: Person;
  /** When true, also render the secondary handle ("(@alice)") after the name. */
  withHandle?: boolean;
  /** Optional test id placed on the visible name span. */
  testId?: string;
  /** Extra classes for the button wrapper, e.g. layout overrides. */
  className?: string;
}

/**
 * Canonical interactive author chip: display name + (optional) NIP-05 badge +
 * (optional) parenthesized handle. The whole chip is one button — clicks open
 * the action menu, desktop hover opens the person card. All callers go through
 * this so hover state, native-tooltip suppression, badge styling, and label
 * formatting stay consistent.
 */
export function InteractivePersonName({
  person,
  withHandle = false,
  testId,
  className,
}: InteractivePersonNameProps) {
  const { t } = useTranslation("tasks");

  const peopleList = useMemo(() => [person], [person]);
  const verifiedPubkeys = useNip05VerifiedPubkeys(peopleList);
  const verified = verifiedPubkeys.has(person.pubkey);

  const { primary, secondary } = useMemo(
    () =>
      formatAuthorMetaParts({
        pubkey: person.pubkey,
        displayName: person.displayName,
        name: person.name,
        nip05: person.nip05,
      }),
    [person],
  );

  const accessibleLabel = t("people.actions.openMenu", {
    name: getCompactPersonLabel(person),
  });

  return (
    <PersonHoverCard person={person}>
      <PersonActionMenu person={person} enableModifierShortcuts>
        <button
          type="button"
          className={cn(
            "group inline-flex max-w-full min-w-0 items-center gap-0.5 rounded text-left transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50",
            className,
          )}
          aria-label={accessibleLabel}
          title=""
        >
          <span
            data-testid={testId}
            className="truncate font-medium text-foreground group-hover:text-primary"
          >
            {primary}
          </span>
          {verified && (
            <BadgeCheck
              className="h-3.5 w-3.5 shrink-0 text-blue-500"
              aria-label={t("people.nip05Verified")}
            />
          )}
          {withHandle && secondary && (
            <span className="truncate opacity-60">{` (${secondary})`}</span>
          )}
        </button>
      </PersonActionMenu>
    </PersonHoverCard>
  );
}
