import type { Person, Task } from "@/types";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

function toDisplayPubkey(value: string): string {
  return value.length === 64 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
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
  people: Person[];
  onPersonClick?: (person: Person) => void;
  className?: string;
  inline?: boolean;
}

export function TaskMentionChips({
  task,
  people,
  onPersonClick,
  className,
  inline = false,
}: TaskMentionChipsProps) {
  const mentionPubkeys = collectMentionPubkeys(task);
  if (mentionPubkeys.length === 0) return null;

  const chips = mentionPubkeys.map((pubkey) => {
    const matchedPerson = people.find((person) => person.id.toLowerCase() === pubkey);
    const label = matchedPerson?.name || matchedPerson?.displayName || toDisplayPubkey(pubkey);

    if (matchedPerson && onPersonClick) {
      return (
        <button
          key={pubkey}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPersonClick(matchedPerson);
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
          aria-label={`Open user ${label}`}
          title={`@${pubkey}`}
        >
          <AtSign className="w-3 h-3" />
          {label}
        </button>
      );
    }

    return (
      <span
        key={pubkey}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary"
        title={`@${pubkey}`}
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
