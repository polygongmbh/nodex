import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface TaskTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Thin wrapper around the native `<input type="time">` so the composer and
 * editor surfaces share identical behaviour. The browser handles HH/MM
 * segmenting, auto-advance, and the pale "--:--" placeholder for us.
 */
export const TaskTimeInput = forwardRef<HTMLInputElement, TaskTimeInputProps>(
  function TaskTimeInput({ value, onChange, className, disabled, id, ...rest }, ref) {
    const ariaLabel = rest["aria-label"] ?? "Time";
    return (
      <input
        ref={ref}
        id={id}
        type="time"
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-8 rounded-md border border-border/50 bg-transparent px-2 font-mono text-xs text-foreground",
          "focus:outline-none focus:ring-1 focus:ring-primary/30",
          "[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-datetime-edit-fields-wrapper]:text-foreground",
          "[&:not(:focus):invalid]:text-muted-foreground/60",
          disabled && "opacity-50",
          className,
        )}
      />
    );
  },
);
