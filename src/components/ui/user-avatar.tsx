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

  useEffect(() => {
    return subscribeAvatarGeneratorChange(() => {
      setGenerator(getPreferredAvatarGenerator());
    });
  }, []);

  return (
    <Avatar className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName || id} /> : null}
      <AvatarFallback className="p-0 overflow-hidden bg-transparent text-foreground text-xs">
        {!avatarUrl && id ? (
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
