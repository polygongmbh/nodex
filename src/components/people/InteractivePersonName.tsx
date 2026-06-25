import { useEffect, useMemo, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { formatAuthorMetaParts } from "@/types/person";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";
import { useResolvedPerson } from "@/infrastructure/nostr/use-nostr-profiles";
import { resolveNip05Identifier } from "@/lib/nostr/nip05-resolver";
import { cn } from "@/lib/utils";

interface InteractivePersonNameProps {
  pubkey: string;
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
  pubkey,
  withHandle = false,
  testId,
  className,
}: InteractivePersonNameProps) {
  const person = useResolvedPerson(pubkey);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    setVerified(false);
    if (!person.nip05) return;
    let cancelled = false;
    const expected = person.pubkey.trim().toLowerCase();
    resolveNip05Identifier(person.nip05).then((resolved) => {
      if (!cancelled && resolved === expected) setVerified(true);
    });
    return () => { cancelled = true; };
  }, [person.pubkey, person.nip05]);

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

  return (
    <PersonHoverCard pubkey={pubkey}>
      <PersonActionMenu pubkey={pubkey} enableModifierShortcuts>
        <button
          type="button"
          className={cn(
            "group inline-flex max-w-full min-w-0 items-center gap-0.5 rounded text-left transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50",
            className,
          )}
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
