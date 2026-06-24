import { cn } from "@/lib/utils";

interface NodexLogoProps {
  className?: string;
}

/**
 * Nodex "N" mark. Strokes use `currentColor`, so color is controlled by the
 * consumer's text color (the adjustable "variable") — e.g. `text-foreground
 * dark:text-primary` for black in light mode and brand blue in dark mode.
 */
export function NodexLogo({ className }: NodexLogoProps) {
  return (
    <svg
      viewBox="0 0 220 220"
      className={cn("text-foreground dark:text-primary", className)}
    >
      <g
        transform="translate(-54.08,-13.59) scale(1.12)"
        fill="none"
        stroke="currentColor"
        strokeWidth={31.104}
        strokeLinecap="round"
      >
        <path d="M90.4329 180.698L90.0113 86.1228C89.9973 82.9897 93.8252 81.4563 95.9781 83.7326L166.928 158.748" />
        <path d="M202.53 40.0443L202.952 134.619C202.966 137.752 199.138 139.286 196.985 137.01L126.035 61.9938" />
      </g>
    </svg>
  );
}
