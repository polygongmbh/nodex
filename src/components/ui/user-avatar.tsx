import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BeamAvatar } from "@/components/ui/beam-avatar";
import { useNostrProfile } from "@/infrastructure/nostr/use-nostr-profiles";

interface UserAvatarProps {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  className?: string;
  beamTestId?: string;
}

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;

export function UserAvatar({ id, displayName, avatarUrl, className, beamTestId }: UserAvatarProps) {
  // When the id looks like a Nostr pubkey, consult the shared profile cache so
  // every surface (sidebar, hover card, kanban card, etc.) resolves the same
  // avatar from the same source — and falls back to the beam in lockstep.
  const isPubkey = typeof id === "string" && PUBKEY_PATTERN.test(id);
  const { profile } = useNostrProfile(isPubkey ? id : null);
  const resolvedAvatarUrl = avatarUrl || profile?.picture || undefined;
  const resolvedDisplayName = displayName || profile?.displayName || profile?.name;
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
