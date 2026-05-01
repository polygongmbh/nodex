import { useMemo } from "react";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { useNostrProfiles } from "@/infrastructure/nostr/use-nostr-profiles";
import { cn } from "@/lib/utils";
import { useFeedPersonLookup } from "@/features/feed-page/views/feed-surface-context";
import { formatUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { InteractivePersonAvatar } from "@/components/people/InteractivePersonAvatar";
import { useIsMobile } from "@/hooks/use-mobile";

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
    pubkey,
    name: label,
    displayName: label,
  };
}

/**
 * Renders a small overlapping stack of profile pictures for a task's assignees.
 * Falls back to the task's author when there are no assignees. Each avatar is
 * clickable and shows a hover card / action menu, mirroring the mention-chip
 * behavior via the shared InteractivePersonAvatar.
 */
export function TaskAssigneeAvatars({
  task,
  className,
  avatarSizeClassName = "w-5 h-5",
  maxVisible = 3,
}: TaskAssigneeAvatarsProps) {
  const isMobile = useIsMobile();
  const pubkeys = useMemo(() => {
    const list = (task.assigneePubkeys ?? []).filter((p) => PUBKEY_PATTERN.test(p));
    if (list.length > 0) return list;
    if (task.author?.pubkey && PUBKEY_PATTERN.test(task.author.pubkey)) return [task.author.pubkey];
    return [];
  }, [task.assigneePubkeys, task.author?.pubkey]);

  const { getProfile } = useNostrProfiles(pubkeys);
  const { getPersonById } = useFeedPersonLookup();

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
          (pubkey === task.author?.pubkey ? task.author.displayName || task.author.name : undefined) ||
          fallbackPerson.displayName;

        return (
          <InteractivePersonAvatar
            key={pubkey}
            person={clickablePerson}
            sizeClassName={avatarSizeClassName}
            avatarClassName="ring-1 ring-background hover:scale-110 transition-transform"
            displayName={displayName}
            directFilterOnClick={!isMobile}
          />
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
