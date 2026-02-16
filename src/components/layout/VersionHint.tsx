import { cn } from "@/lib/utils";

interface VersionHintProps {
  className?: string;
}

export function VersionHint({ className }: VersionHintProps) {
  const version = import.meta.env.PACKAGE_VERSION || "0.0.0";

  return (
    <span
      className={cn("text-[11px] text-muted-foreground/80", className)}
      title={`Nodex version ${version}`}
      aria-label={`Nodex version ${version}`}
    >
      v{version}
    </span>
  );
}
