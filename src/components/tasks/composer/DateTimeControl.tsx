import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Clock, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TaskTimeInput } from "@/components/tasks/TaskTimeInput";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface DateTimeControlProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  time: string;
  onTimeChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  clearTitle?: string;
  timeLabel?: string;
  popoverContentRef?: RefObject<HTMLDivElement>;
  buttonClassName?: string;
  leading?: ReactNode;
  minDate?: Date;
  clearable?: boolean;
}

export function DateTimeControl({
  date,
  onDateChange,
  time,
  onTimeChange,
  placeholder,
  clearLabel,
  clearTitle,
  timeLabel = "Hours",
  popoverContentRef,
  buttonClassName,
  leading,
  minDate,
  clearable = true,
}: DateTimeControlProps) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const contentRef = popoverContentRef ?? fallbackRef;
  const [open, setOpen] = useState(false);

  return (
    <>
      {leading}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 rounded-md border border-border/50 px-2 text-left text-sm transition-colors hover:bg-muted/50 hover:text-foreground",
              date ? "text-foreground" : "text-muted-foreground",
              buttonClassName,
            )}
          >
            {date ? format(date, "MMM d, yyyy") : placeholder}
          </button>
        </PopoverTrigger>
        <PopoverContent ref={contentRef} className="w-auto p-0" align="start">
          <CalendarComponent
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={(next) => {
              onDateChange(next ?? undefined);
              if (next) setOpen(false);
            }}
            disabled={minDate ? { before: minDate } : undefined}
            initialFocus
            className="p-3 pointer-events-auto"
            classNames={{
              today: "[&>button]:font-bold [&>button]:ring-1 [&>button]:ring-accent-foreground/60 [&>button]:ring-inset",
            }}
          />
        </PopoverContent>
      </Popover>
      {date && (
        <>
          <Clock className="h-4 w-4 text-muted-foreground" />
          <TaskTimeInput aria-label={timeLabel} value={time} onChange={onTimeChange} />
          {clearable && (
            <button
              type="button"
              aria-label={clearLabel}
              title={clearTitle ?? clearLabel}
              onClick={() => {
                onDateChange(undefined);
                onTimeChange("");
              }}
              className="rounded-md p-1.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </>
  );
}
