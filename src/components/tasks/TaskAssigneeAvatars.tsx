import { useMemo } from "react";
import type { Task } from "@/types";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNostrProfiles } from "@/infrastructure/nostr/use-nostr-profiles";
import { cn } from "@/lib/utils";

interface TaskAssigneeAvatarsProps {
  task: Task;
  className?: string;
  /** Tailwind size class applied to each avatar (e.g. "w-5 h-5"). */
  avatarSizeClassName?: string;
  /** Maximum number of avatars to render before collapsing the rest into a "+N" chip. */
  maxVisible?: number;
}

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * Renders a small overlapping stack of profile pictures for a task's assignees.
 * Falls back to the task's author when there are no assignees.
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
        const displayName =
          profile?.displayName ||
          profile?.name ||
          (pubkey === task.author?.id ? task.author.displayName || task.author.name : undefined);
        return (
          <UserAvatar
            key={pubkey}
            id={pubkey}
            displayName={displayName}
            avatarUrl={profile?.picture || (pubkey === task.author?.id ? task.author.avatar : undefined)}
            className={cn(
              avatarSizeClassName,
              "ring-1 ring-background flex-shrink-0"
            )}
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
