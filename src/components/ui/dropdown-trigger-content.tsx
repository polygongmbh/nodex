import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropdownTriggerContentProps {
  leading?: ReactNode;
  label: ReactNode;
  className?: string;
  labelClassName?: string;
  chevronClassName?: string;
}

export function DropdownTriggerContent({
  leading,
  label,
  className,
  labelClassName,
  chevronClassName,
}: DropdownTriggerContentProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className={cn("min-w-0 truncate", labelClassName)}>{label}</span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground", chevronClassName)} aria-hidden="true" />
    </div>
  );
}
