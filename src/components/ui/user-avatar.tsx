import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BeamAvatar } from "@/components/ui/beam-avatar";
import { useCachedNostrProfile } from "@/infrastructure/nostr/use-nostr-profiles";

interface UserAvatarProps {
  /** A 64-char hex Nostr pubkey. Other ids are not supported. */
  id: string;
  /** Optional display-name override. Falls back to the cached profile name, then the pubkey. */
  displayName?: string;
  className?: string;
  beamTestId?: string;
}

/**
 * Single source of truth for rendering a Nostr user's avatar. Resolves the
 * picture and display name from the shared Kind 0 profile cache, and falls
 * back to a deterministic beam identicon. Every surface (sidebar, hover card,
 * kanban card, user menu, mentions, …) uses this primitive directly so they
 * all show the same picture and fall back uniformly.
 */
export function UserAvatar({ id, displayName, className, beamTestId }: UserAvatarProps) {
  const cachedProfile = useCachedNostrProfile(id);
  const resolvedDisplayName = displayName || cachedProfile?.displayName || cachedProfile?.name;
  const resolvedAvatarUrl = cachedProfile?.picture || undefined;
  const initial = (resolvedDisplayName || id || "?").charAt(0).toUpperCase();

  return (
    <Avatar className={className}>
      {resolvedAvatarUrl ? <AvatarImage src={resolvedAvatarUrl} alt={resolvedDisplayName || id} /> : null}
      <AvatarFallback className="p-0 overflow-hidden bg-transparent text-foreground text-xs">
        {!resolvedAvatarUrl && id ? (
          <BeamAvatar seed={id} size={64} className="w-full h-full" data-testid={beamTestId} />
        ) : (
          <span>{initial}</span>
        )}
      </AvatarFallback>
    </Avatar>
  );
}
