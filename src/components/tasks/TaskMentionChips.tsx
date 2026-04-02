import type { Person, Task } from "@/types";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { useFeedPersonLookup, useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

function toDisplayPubkey(value: string): string {
  return formatUserFacingPubkey(value);
}

function buildFallbackPersonFromPubkey(pubkey: string): Person {
  const label = toDisplayPubkey(pubkey);
  return {
    id: pubkey,
    name: label,
    displayName: label,
    isOnline: false,
    isSelected: false,
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
  onPersonClick?: (person: Person) => void;
  className?: string;
  inline?: boolean;
}

export function TaskMentionChips({
  task,
  people: peopleProp,
  onPersonClick,
  className,
  inline = false,
}: TaskMentionChipsProps) {
  const { people: contextPeople } = useFeedSurfaceState();
  const { getPersonById } = useFeedPersonLookup();
  const people = peopleProp ?? contextPeople;
  const mentionPubkeys = collectMentionPubkeys(task);
  if (mentionPubkeys.length === 0) return null;

  const chips = mentionPubkeys.map((pubkey) => {
    const matchedPerson = peopleProp
      ? people.find((person) => person.id.toLowerCase() === pubkey)
      : getPersonById(pubkey);
    const fallbackPerson = buildFallbackPersonFromPubkey(pubkey);
    const clickablePerson = matchedPerson || fallbackPerson;
    const label = matchedPerson?.name || matchedPerson?.displayName || fallbackPerson.displayName;

    if (onPersonClick && clickablePerson) {
      return (
        <button
          key={pubkey}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPersonClick(clickablePerson);
          }}
          className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
          aria-label={`Open user ${label}`}
          title={`@${toUserFacingPubkey(pubkey)}`}
        >
          <AtSign className="w-3 h-3" />
          {label}
        </button>
      );
    }

    return (
      <span
        key={pubkey}
        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
        title={`@${toUserFacingPubkey(pubkey)}`}
      >
        <AtSign className="w-3 h-3" />
        {label}
      </span>
    );
  });

  if (inline) {
    return <>{chips}</>;
  }

  return <div className={cn("flex flex-wrap gap-1", className)}>{chips}</div>;
}
