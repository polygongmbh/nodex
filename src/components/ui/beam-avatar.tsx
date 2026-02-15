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
      eyeY: 24 + ((hash >> 3) % 6),
      eyeGap: 8 + ((hash >> 9) % 4),
      eyeR: 2 + ((hash >> 13) % 2),
      mouthW: 18 + ((hash >> 15) % 10),
      mouthY: 38 + ((hash >> 19) % 5),
      mouthArc: 6 + ((hash >> 23) % 5),
    };
  }, [normalizedSeed]);

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      data-generator="boring"
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
        <circle cx={32 - avatar.eyeGap} cy={avatar.eyeY} r={avatar.eyeR} fill="#1f2937" opacity="0.8" />
        <circle cx={32 + avatar.eyeGap} cy={avatar.eyeY} r={avatar.eyeR} fill="#1f2937" opacity="0.8" />
        <path
          d={`M ${32 - avatar.mouthW / 2} ${avatar.mouthY} Q 32 ${avatar.mouthY + avatar.mouthArc} ${32 + avatar.mouthW / 2} ${avatar.mouthY}`}
          stroke="#1f2937"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
      </g>
    </svg>
  );
}
