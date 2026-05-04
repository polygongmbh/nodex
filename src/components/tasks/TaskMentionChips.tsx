import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { TASK_CHIP_STYLES } from "@/lib/task-interaction-styles";
import { cn } from "@/lib/utils";
import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { useFeedPersonLookup, useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

function toDisplayPubkey(value: string): string {
  return formatUserFacingPubkey(value);
}

function buildFallbackPersonFromPubkey(pubkey: string): Person {
  const label = toDisplayPubkey(pubkey);
  return {
    pubkey,
    name: label,
    displayName: label,
  };
}

function collectMentionPubkeys(task: Task): string[] {
  const values = [
    ...(task.assigneePubkeys || []),
    ...((task.mentions || []).filter((mention) => PUBKEY_PATTERN.test(mention))),
  ];

  return Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => PUBKEY_PATTERN.test(value)))
  );
}

export function hasTaskMentionChips(task: Task): boolean {
  return collectMentionPubkeys(task).length > 0;
}

interface TaskMentionChipsProps {
  task: Task;
  people?: Person[];
  className?: string;
  inline?: boolean;
}

export function TaskMentionChips({
  task,
  people: peopleProp,
  className,
  inline = false,
}: TaskMentionChipsProps) {
  const { people: contextPeople } = useFeedSurfaceState();
  const { getPersonById } = useFeedPersonLookup();
  const people = peopleProp ?? contextPeople;
  const mentionPubkeys = collectMentionPubkeys(task);
  if (mentionPubkeys.length === 0) return null;

  const resolvedMentions = mentionPubkeys.map((pubkey) => {
    const matchedPerson = peopleProp
      ? people.find((person) => person.pubkey.toLowerCase() === pubkey)
      : getPersonById(pubkey);
    const fallbackPerson = buildFallbackPersonFromPubkey(pubkey);
    const clickablePerson = matchedPerson || fallbackPerson;
    const label = matchedPerson?.name || matchedPerson?.displayName || fallbackPerson.displayName;
    return { pubkey, matchedPerson, fallbackPerson, clickablePerson, label };
  });

  resolvedMentions.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );

  const chips = resolvedMentions.map(({ pubkey, matchedPerson, fallbackPerson, clickablePerson, label }) => {
    if (clickablePerson) {
      return (
        <PersonHoverCard
          key={pubkey}
          person={clickablePerson}
          triggerClassName="inline-flex shrink-0 leading-none"
        >
          <PersonActionMenu person={clickablePerson} enableModifierShortcuts>
            <button
              type="button"
              className={cn(TASK_CHIP_STYLES.mention, "transition-colors hover:bg-primary/15", className)}
              aria-label={`Person actions for ${label}`}
              title=""
            >
              @{label}
            </button>
          </PersonActionMenu>
        </PersonHoverCard>
      );
    }

    return (
      <span
        key={pubkey}
        className={cn(TASK_CHIP_STYLES.mention, className)}
        title={`@${toUserFacingPubkey(pubkey)}`}
      >
        @{label}
      </span>
    );
  });

  if (inline) {
    return <>{chips}</>;
  }

  return <div className={cn("flex flex-wrap gap-1", className)}>{chips}</div>;
}
