import { useMemo } from "react";

interface DicebearLocalAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  "data-testid"?: string;
}

const PALETTE = ["#f97316", "#f59e0b", "#fb7185", "#22c55e", "#60a5fa"];

function hashSeed(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return hash >>> 0;
}

export function DicebearLocalAvatar({
  seed,
  size = 32,
  className,
  "data-testid": dataTestId,
}: DicebearLocalAvatarProps) {
  const normalizedSeed = seed.trim().toLowerCase() || "anon";
  const avatar = useMemo(() => {
    const hash = hashSeed(normalizedSeed);
    const bg = PALETTE[hash % PALETTE.length];
    const skin = PALETTE[(hash >> 3) % PALETTE.length];
    const hair = PALETTE[(hash >> 7) % PALETTE.length];
    const eyeY = 25 + ((hash >> 11) % 4);
    const eyeGap = 8 + ((hash >> 14) % 4);
    const mouthWidth = 16 + ((hash >> 17) % 8);
    const smile = 3 + ((hash >> 20) % 5);
    return {
      clipId: `dicebear-local-${hash.toString(16)}`,
      bg,
      skin,
      hair,
      eyeY,
      eyeGap,
      mouthWidth,
      smile,
    };
  }, [normalizedSeed]);

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      data-generator="dicebear-local"
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
        <circle cx="32" cy="36" r="18" fill={avatar.skin} opacity="0.9" />
        <path d="M14 24 C18 8, 46 8, 50 24 L50 30 L14 30 Z" fill={avatar.hair} opacity="0.95" />
        <circle cx={32 - avatar.eyeGap} cy={avatar.eyeY} r="2.1" fill="#1f2937" />
        <circle cx={32 + avatar.eyeGap} cy={avatar.eyeY} r="2.1" fill="#1f2937" />
        <path
          d={`M ${32 - avatar.mouthWidth / 2} 40 Q 32 ${40 + avatar.smile} ${32 + avatar.mouthWidth / 2} 40`}
          stroke="#1f2937"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
      </g>
    </svg>
  );
}
