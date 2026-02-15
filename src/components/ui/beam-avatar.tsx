import Avatar from "boring-avatars";

interface BeamAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  "data-testid"?: string;
}

export function BeamAvatar({ seed, size = 32, className, "data-testid": dataTestId }: BeamAvatarProps) {
  const normalizedSeed = seed.trim().toLowerCase() || "anon";
  return (
    <span
      className={className}
      data-generator="boring-marble"
      data-testid={dataTestId}
      role="img"
      aria-label="Generated avatar"
    >
      <Avatar size={size} name={normalizedSeed} variant="marble" square={false} />
    </span>
  );
}
