import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TaskTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
  id?: string;
  disabled?: boolean;
}

function splitTime(value: string): { hh: string; mm: string } {
  if (!value) return { hh: "", mm: "" };
  const [h = "", m = ""] = value.split(":");
  return { hh: h.slice(0, 2), mm: m.slice(0, 2) };
}

function joinTime(hh: string, mm: string): string {
  if (!hh && !mm) return "";
  const h = (hh || "0").padStart(2, "0");
  const m = (mm || "0").padStart(2, "0");
  return `${h}:${m}`;
}

function clampHour(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (digits.length === 0) return "";
  const n = Number(digits);
  if (n > 23) return "23";
  return digits;
}

function clampMinute(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  if (digits.length === 0) return "";
  const n = Number(digits);
  if (n > 59) return "59";
  return digits;
}

/**
 * Two-segment HH:MM time input with pale placeholder and auto-advance from
 * hours to minutes once two hour digits are entered. Provides consistent
 * appearance between composer and editor surfaces.
 */
export const TaskTimeInput = forwardRef<HTMLInputElement, TaskTimeInputProps>(
  function TaskTimeInput({ value, onChange, className, disabled, id, ...rest }, ref) {
    const ariaLabel = rest["aria-label"];
    const [hh, setHh] = useState(() => splitTime(value).hh);
    const [mm, setMm] = useState(() => splitTime(value).mm);
    const minuteRef = useRef<HTMLInputElement>(null);
    const hourRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      const next = splitTime(value);
      setHh(next.hh);
      setMm(next.mm);
    }, [value]);

    const emit = (nextHh: string, nextMm: string) => {
      if (!nextHh && !nextMm) {
        onChange("");
      } else {
        onChange(joinTime(nextHh, nextMm));
      }
    };

    return (
      <div
        className={cn(
          "inline-flex h-8 items-center rounded-md border border-border/50 bg-transparent px-2 font-mono text-xs text-foreground focus-within:ring-1 focus-within:ring-primary/30",
          disabled && "opacity-50",
          className,
        )}
      >
        <input
          ref={(node) => {
            hourRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
          }}
          id={id}
          aria-label={ariaLabel ?? "Hours"}
          inputMode="numeric"
          disabled={disabled}
          placeholder="HH"
          value={hh}
          onChange={(event) => {
            const next = clampHour(event.target.value);
            setHh(next);
            emit(next, mm);
            if (next.length === 2) {
              minuteRef.current?.focus();
              minuteRef.current?.select();
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          className="w-7 bg-transparent text-center outline-none placeholder:text-muted-foreground/50"
          maxLength={2}
        />
        <span aria-hidden="true" className="select-none text-muted-foreground/70">:</span>
        <input
          ref={minuteRef}
          aria-label="Minutes"
          inputMode="numeric"
          disabled={disabled}
          placeholder="MM"
          value={mm}
          onChange={(event) => {
            const next = clampMinute(event.target.value);
            setMm(next);
            emit(hh, next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && mm.length === 0) {
              hourRef.current?.focus();
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          className="w-7 bg-transparent text-center outline-none placeholder:text-muted-foreground/50"
          maxLength={2}
        />
      </div>
    );
  },
);
