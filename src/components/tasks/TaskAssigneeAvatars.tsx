import { getTaskAssigneePubkeys } from "@/types";
import { useMemo } from "react";
import type { Post } from "@/types";
import { cn } from "@/lib/utils";
import { InteractivePersonAvatar } from "@/components/people/InteractivePersonAvatar";
import { useIsMobile } from "@/hooks/use-mobile";

interface TaskAssigneeAvatarsProps {
  task: Post;
  className?: string;
  /** Tailwind size class applied to each avatar (e.g. "w-5 h-5"). */
  avatarSizeClassName?: string;
  /** Maximum number of avatars to render before collapsing the rest into a "+N" chip. */
  maxVisible?: number;
}

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

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
  const assigneePubkeys = getTaskAssigneePubkeys(task);
  const authorPubkey = task.pubkey;
  const pubkeys = useMemo(() => {
    const list = (assigneePubkeys ?? []).filter((p) => PUBKEY_PATTERN.test(p));
    if (list.length > 0) return list;
    if (authorPubkey && PUBKEY_PATTERN.test(authorPubkey)) return [authorPubkey];
    return [];
  }, [assigneePubkeys, authorPubkey]);

  if (pubkeys.length === 0) return null;

  const visible = pubkeys.slice(0, maxVisible);
  const overflow = pubkeys.length - visible.length;

  return (
    <div
      className={cn("flex items-center -space-x-1.5", className)}
      data-testid="task-assignee-avatars"
      title={`Assigned to ${pubkeys.length} ${pubkeys.length === 1 ? "person" : "people"}`}
    >
      {visible.map((pubkey) => (
        <InteractivePersonAvatar
          key={pubkey}
          pubkey={pubkey}
          sizeClassName={avatarSizeClassName}
          className="ring-1 ring-background hover:scale-110 transition-transform"
          directFilterOnClick={!isMobile}
        />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            avatarSizeClassName,
            "ring-1 ring-background rounded-full bg-muted text-muted-foreground text-[10px] font-medium flex items-center justify-center flex-shrink-0"
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
