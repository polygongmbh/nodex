import { useMemo } from "react";

interface BeamAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  "data-testid"?: string;
}

const WARM_PALETTE = ["#f59e0b", "#fb7185", "#f97316", "#34d399", "#fcd34d"];

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function pickColor(hash: number, offset: number): string {
  return WARM_PALETTE[(hash + offset) % WARM_PALETTE.length];
}

export function BeamAvatar({ seed, size = 32, className, "data-testid": dataTestId }: BeamAvatarProps) {
  const normalizedSeed = seed.trim().toLowerCase() || "anon";
  const avatar = useMemo(() => {
    const hash = hashSeed(normalizedSeed);
    return {
      clipId: `beam-clip-${hash.toString(16)}`,
      bg: pickColor(hash, 0),
      shapeA: pickColor(hash, 1),
      shapeB: pickColor(hash, 2),
      shapeC: pickColor(hash, 3),
      x1: 8 + (hash % 14),
      y1: 8 + ((hash >> 4) % 14),
      r1: 7 + ((hash >> 8) % 8),
      x2: 26 + ((hash >> 12) % 18),
      y2: 18 + ((hash >> 16) % 16),
      r2: 6 + ((hash >> 20) % 8),
      angle: (hash % 360).toString(),
    };
  }, [normalizedSeed]);

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      data-testid={dataTestId}
      role="img"
      aria-label="Generated avatar"
    >
      <defs>
        <clipPath id={avatar.clipId}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${avatar.clipId})`}>
        <rect width="64" height="64" fill={avatar.bg} />
        <circle cx={avatar.x1} cy={avatar.y1} r={avatar.r1} fill={avatar.shapeA} opacity="0.9" />
        <circle cx={avatar.x2} cy={avatar.y2} r={avatar.r2} fill={avatar.shapeB} opacity="0.8" />
        <rect
          x="-8"
          y="30"
          width="84"
          height="26"
          fill={avatar.shapeC}
          opacity="0.75"
          transform={`rotate(${avatar.angle} 32 32)`}
        />
      </g>
    </svg>
  );
}
