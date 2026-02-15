import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BeamAvatar } from "@/components/ui/beam-avatar";
import { DicebearLocalAvatar } from "@/components/ui/dicebear-local-avatar";
import {
  getPreferredAvatarGenerator,
  subscribeAvatarGeneratorChange,
} from "@/lib/avatar-preferences";

interface UserAvatarProps {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  className?: string;
  beamTestId?: string;
}

export function UserAvatar({ id, displayName, avatarUrl, className, beamTestId }: UserAvatarProps) {
  const [generator, setGenerator] = useState(() => getPreferredAvatarGenerator());
  const initial = (displayName || id || "?").charAt(0).toUpperCase();
  const isLegacyPlaceholder = Boolean(
    avatarUrl && avatarUrl.includes("/avataaars/")
  );
  const effectiveAvatarUrl = isLegacyPlaceholder ? undefined : avatarUrl;

  useEffect(() => {
    return subscribeAvatarGeneratorChange(() => {
      setGenerator(getPreferredAvatarGenerator());
    });
  }, []);

  return (
    <Avatar className={className}>
      {effectiveAvatarUrl ? <AvatarImage src={effectiveAvatarUrl} alt={displayName || id} /> : null}
      <AvatarFallback className="p-0 overflow-hidden bg-transparent text-foreground text-xs">
        {!effectiveAvatarUrl && id ? (
          generator === "dicebear-local" ? (
            <DicebearLocalAvatar seed={id} size={64} className="w-full h-full" data-testid={beamTestId} />
          ) : (
            <BeamAvatar seed={id} size={64} className="w-full h-full" data-testid={beamTestId} />
          )
        ) : (
          <span>{initial}</span>
        )}
      </AvatarFallback>
    </Avatar>
  );
}
