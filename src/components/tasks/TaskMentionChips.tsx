import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedPersonLookup, useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { getPersonShortcutIntent, toPersonShortcutInteraction } from "@/components/people/person-shortcuts";

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
  const dispatchFeedInteraction = useFeedInteractionDispatch();
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

    if (clickablePerson) {
      return (
        <PersonHoverCard key={pubkey} person={clickablePerson}>
          <button
            type="button"
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            aria-label={`Person actions for ${label}`}
            onClick={(event) => {
              const shortcutIntent = getPersonShortcutIntent(event);
              if (!shortcutIntent) return;
              event.preventDefault();
              event.stopPropagation();
              void dispatchFeedInteraction(toPersonShortcutInteraction(clickablePerson, shortcutIntent));
            }}
          >
            <AtSign className="h-3 w-3" />
            {label}
          </button>
        </PersonHoverCard>
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
