import { useMemo } from "react";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNostrProfiles } from "@/infrastructure/nostr/use-nostr-profiles";
import { cn } from "@/lib/utils";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedPersonLookup } from "@/features/feed-page/views/feed-surface-context";
import {
  getPersonShortcutIntent,
  toPersonShortcutInteraction,
} from "@/components/people/person-shortcuts";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

interface TaskAssigneeAvatarsProps {
  task: Task;
  className?: string;
  /** Tailwind size class applied to each avatar (e.g. "w-5 h-5"). */
  avatarSizeClassName?: string;
  /** Maximum number of avatars to render before collapsing the rest into a "+N" chip. */
  maxVisible?: number;
}

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

function buildFallbackPersonFromPubkey(pubkey: string): Person {
  const label = formatUserFacingPubkey(pubkey);
  return {
    id: pubkey,
    name: label,
    displayName: label,
    isOnline: false,
    isSelected: false,
  };
}

/**
 * Renders a small overlapping stack of profile pictures for a task's assignees.
 * Falls back to the task's author when there are no assignees. Each avatar is
 * clickable and shows a hover card, mirroring the mention-chip behavior.
 */
export function TaskAssigneeAvatars({
  task,
  className,
  avatarSizeClassName = "w-5 h-5",
  maxVisible = 3,
}: TaskAssigneeAvatarsProps) {
  const pubkeys = useMemo(() => {
    const list = (task.assigneePubkeys ?? []).filter((p) => PUBKEY_PATTERN.test(p));
    if (list.length > 0) return list;
    if (task.author?.id && PUBKEY_PATTERN.test(task.author.id)) return [task.author.id];
    return [];
  }, [task.assigneePubkeys, task.author?.id]);

  const { getProfile } = useNostrProfiles(pubkeys);
  const { getPersonById } = useFeedPersonLookup();
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  if (pubkeys.length === 0) return null;

  const visible = pubkeys.slice(0, maxVisible);
  const overflow = pubkeys.length - visible.length;

  return (
    <div
      className={cn("flex items-center -space-x-1.5", className)}
      aria-label={`Assigned to ${pubkeys.length} ${pubkeys.length === 1 ? "person" : "people"}`}
    >
      {visible.map((pubkey) => {
        const profile = getProfile(pubkey);
        const matchedPerson = getPersonById(pubkey);
        const fallbackPerson = buildFallbackPersonFromPubkey(pubkey);
        const clickablePerson = matchedPerson || fallbackPerson;
        const displayName =
          profile?.displayName ||
          profile?.name ||
          matchedPerson?.displayName ||
          matchedPerson?.name ||
          (pubkey === task.author?.id ? task.author.displayName || task.author.name : undefined) ||
          fallbackPerson.displayName;
        const avatarUrl =
          profile?.picture ||
          (pubkey === task.author?.id ? task.author.avatar : undefined);

        return (
          <PersonHoverCard
            key={pubkey}
            person={clickablePerson}
            triggerClassName="inline-flex shrink-0 leading-none rounded-full"
          >
            <button
              type="button"
              aria-label={`Person actions for ${displayName}`}
              title=""
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40"
              onClick={(event) => {
                event.stopPropagation();
                const shortcutIntent = getPersonShortcutIntent(event);
                if (!shortcutIntent) return;
                event.preventDefault();
                void dispatchFeedInteraction(
                  toPersonShortcutInteraction(clickablePerson, shortcutIntent)
                );
              }}
            >
              <UserAvatar
                id={pubkey}
                displayName={displayName}
                avatarUrl={avatarUrl}
                className={cn(
                  avatarSizeClassName,
                  "ring-1 ring-background flex-shrink-0 transition-transform hover:scale-110"
                )}
              />
            </button>
          </PersonHoverCard>
        );
      })}
      {overflow > 0 ? (
        <span
          className={cn(
            avatarSizeClassName,
            "ring-1 ring-background rounded-full bg-muted text-muted-foreground text-[10px] font-medium flex items-center justify-center flex-shrink-0"
          )}
          aria-hidden="true"
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
