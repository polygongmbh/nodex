import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Clock, MapPin, X } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TaskTimeInput } from "@/components/tasks/TaskTimeInput";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The minimal event description the mobile composer attaches to a message to
 * turn it into a NIP-52 calendar event. `time` (HH:MM) being set makes the
 * event time-based (kind 31923); otherwise it is all-day (kind 31922).
 * `endTime` may be set without `end` — that's a same-day timed event.
 */
export interface ComposeEventDraft {
  start: Date;
  end?: Date;
  time?: string;
  endTime?: string;
  title?: string;
  location?: string;
}

interface ComposeEventDialogProps {
  open: boolean;
  initialDraft: ComposeEventDraft | null;
  onConfirm: (draft: ComposeEventDraft) => void;
  onCancel: () => void;
}

export function ComposeEventDialog({ open, initialDraft, onConfirm, onCancel }: ComposeEventDialogProps) {
  const { t } = useTranslation("composer");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");

  // why: reseed the form from the attached draft each time the dialog opens so
  // editing an existing event shows its values and a fresh open starts clean.
  useEffect(() => {
    if (!open) return;
    setRange(initialDraft ? { from: initialDraft.start, to: initialDraft.end } : undefined);
    setTime(initialDraft?.time ?? "");
    setEndTime(initialDraft?.endTime ?? "");
    setTitle(initialDraft?.title ?? "");
    setLocation(initialDraft?.location ?? "");
  }, [open, initialDraft]);

  const start = range?.from;
  const end = range?.to && range.to.getTime() !== range.from?.getTime() ? range.to : undefined;

  const handleConfirm = () => {
    if (!start) return;
    onConfirm({
      start,
      end,
      time: time.trim() || undefined,
      endTime: endTime.trim() || undefined,
      title: title.trim() || undefined,
      location: location.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{t("composer.event.attach")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border">
            <CalendarComponent
              mode="range"
              selected={range}
              onSelect={setRange}
              className="!p-2"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            {start
              ? end
                ? `${format(start, "MMM d")} – ${format(end, "MMM d")}`
                : format(start, "MMM d")
              : t("composer.event.missingStart")}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border px-2 h-9 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <TaskTimeInput
                value={time}
                onChange={setTime}
                title={t("composer.event.startTime")}
                className="border-0 bg-transparent px-0 h-8"
              />
              <span className="text-muted-foreground/60 select-none">–</span>
              <TaskTimeInput
                value={endTime}
                onChange={setEndTime}
                title={t("composer.event.endTime")}
                className="border-0 bg-transparent px-0 h-8"
              />
              {(time || endTime) && (
                <button
                  type="button"
                  onClick={() => {
                    setTime("");
                    setEndTime("");
                  }}
                  className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                  title={t("composer.event.allDay")}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {time || endTime ? "" : t("composer.event.allDay")}
            </span>
          </div>

          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("composer.event.title")}
          />

          <div className="relative">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={t("composer.event.location")}
              className="pl-8"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("composer.actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!start} data-testid="compose-event-confirm">
            {t("composer.event.attach")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
