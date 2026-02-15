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
  const isLegacyPlaceholder = Boolean(
    avatarUrl &&
      (avatarUrl.includes("api.dicebear.com") || avatarUrl.includes("/avataaars/"))
  );
  const effectiveAvatarUrl = isLegacyPlaceholder ? undefined : avatarUrl;

  return (
    <Avatar className={className}>
      {effectiveAvatarUrl ? <AvatarImage src={effectiveAvatarUrl} alt={displayName || id} /> : null}
      <AvatarFallback className="p-0 overflow-hidden bg-transparent text-foreground text-xs">
        {!effectiveAvatarUrl && id ? (
          <BeamAvatar seed={id} size={64} className="w-full h-full" data-testid={beamTestId} />
        ) : (
          <span>{initial}</span>
        )}
      </AvatarFallback>
    </Avatar>
  );
}
