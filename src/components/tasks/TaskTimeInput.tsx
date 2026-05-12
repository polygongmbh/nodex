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
  const match = /^(\d{0,2}):?(\d{0,2})$/.exec(value || "");
  if (!match) return { hh: "", mm: "" };
  return { hh: match[1] ?? "", mm: match[2] ?? "" };
}

function clamp(value: string, max: number): string {
  if (!value) return "";
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(Math.max(n, 0), max)).padStart(2, "0");
}

/**
 * Two-segment HH:MM input. Auto-advances to minutes after typing 2 hour
 * digits (and pre-fills minutes with "00"). Pale placeholder text on both
 * segments for consistent styling between the composer and the editor form.
 */
export const TaskTimeInput = forwardRef<HTMLInputElement, TaskTimeInputProps>(
  function TaskTimeInput({ value, onChange, className, disabled, id, ...rest }, ref) {
    const ariaLabel = rest["aria-label"] ?? "Time";
    const [hh, setHh] = useState(() => splitTime(value).hh);
    const [mm, setMm] = useState(() => splitTime(value).mm);
    const minutesRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      const next = splitTime(value);
      setHh(next.hh);
      setMm(next.mm);
    }, [value]);

    const emit = (nextHh: string, nextMm: string) => {
      if (!nextHh && !nextMm) {
        onChange("");
        return;
      }
      const padHh = nextHh ? nextHh.padStart(2, "0") : "00";
      const padMm = nextMm ? nextMm.padStart(2, "0") : "00";
      onChange(`${padHh}:${padMm}`);
    };

    const handleHhChange = (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 2);
      setHh(digits);
      if (digits.length === 2) {
        const padded = clamp(digits, 23);
        setHh(padded);
        if (!mm) {
          setMm("00");
          emit(padded, "00");
        } else {
          emit(padded, mm);
        }
        // Move focus to minutes for further editing
        requestAnimationFrame(() => {
          minutesRef.current?.focus();
          minutesRef.current?.select();
        });
      } else if (digits.length === 0 && !mm) {
        emit("", "");
      }
    };

    const handleHhBlur = () => {
      if (!hh) return;
      const padded = clamp(hh, 23);
      setHh(padded);
      emit(padded, mm || "00");
      if (!mm) setMm("00");
    };

    const handleMmChange = (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 2);
      setMm(digits);
      if (digits.length === 2) {
        const padded = clamp(digits, 59);
        setMm(padded);
        emit(hh || "00", padded);
      } else if (digits.length === 0 && !hh) {
        emit("", "");
      }
    };

    const handleMmBlur = () => {
      if (!mm) {
        if (hh) emit(hh, "00");
        return;
      }
      const padded = clamp(mm, 59);
      setMm(padded);
      emit(hh || "00", padded);
    };

    const baseField =
      "h-8 w-9 bg-transparent text-center font-mono text-xs text-foreground tabular-nums " +
      "placeholder:text-muted-foreground/40 focus:outline-none";

    return (
      <div
        className={cn(
          "inline-flex h-8 items-center rounded-md border border-border/50 bg-transparent px-1.5",
          "focus-within:ring-1 focus-within:ring-primary/30",
          disabled && "opacity-50",
          className,
        )}
      >
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel}
          disabled={disabled}
          placeholder="--"
          maxLength={2}
          value={hh}
          onChange={(event) => handleHhChange(event.target.value)}
          onBlur={handleHhBlur}
          onFocus={(event) => event.currentTarget.select()}
          className={baseField}
        />
        <span className="text-muted-foreground/60 select-none" aria-hidden>
          :
        </span>
        <input
          ref={minutesRef}
          type="text"
          inputMode="numeric"
          aria-label="Minutes"
          disabled={disabled}
          placeholder="--"
          maxLength={2}
          value={mm}
          onChange={(event) => handleMmChange(event.target.value)}
          onBlur={handleMmBlur}
          onFocus={(event) => event.currentTarget.select()}
          className={baseField}
        />
      </div>
    );
  },
);
