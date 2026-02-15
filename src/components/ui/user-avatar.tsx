import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BeamAvatar } from "@/components/ui/beam-avatar";

interface UserAvatarProps {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  className?: string;
  beamTestId?: string;
}

export function UserAvatar({ id, displayName, avatarUrl, className, beamTestId }: UserAvatarProps) {
  const initial = (displayName || id || "?").charAt(0).toUpperCase();

  return (
    <Avatar className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName || id} /> : null}
      <AvatarFallback className="p-0 overflow-hidden bg-transparent text-foreground text-xs">
        {!avatarUrl && id ? (
          <BeamAvatar seed={id} size={64} className="w-full h-full" data-testid={beamTestId} />
        ) : (
          <span>{initial}</span>
        )}
      </AvatarFallback>
    </Avatar>
  );
}
