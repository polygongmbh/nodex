import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { RawNostrEvent } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RawNostrEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: RawNostrEvent | null;
}

export function RawNostrEventDialog({ open, onOpenChange, event }: RawNostrEventDialogProps) {
  const { t } = useTranslation();
  const rawJson = useMemo(() => (event ? JSON.stringify(event, null, 2) : ""), [event]);

  const handleCopyJson = async () => {
    if (!rawJson) return;
    try {
      await navigator.clipboard.writeText(rawJson);
      toast.success(t("tasks.rawEvent.toasts.copiedJson"));
    } catch {
      toast.error(t("tasks.rawEvent.toasts.copyJsonFailed"));
    }
  };

  const handleCopyEventId = async () => {
    if (!event?.id) return;
    try {
      await navigator.clipboard.writeText(event.id);
      toast.success(t("tasks.rawEvent.toasts.copiedEventId"));
    } catch {
      toast.error(t("tasks.rawEvent.toasts.copyEventIdFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("tasks.rawEvent.title")}</DialogTitle>
          <DialogDescription>{t("tasks.rawEvent.description")}</DialogDescription>
        </DialogHeader>
        {event ? (
          <pre className="max-h-[55vh] overflow-auto rounded border border-border bg-muted/40 p-3 text-xs leading-5">
            <code>{rawJson}</code>
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">{t("tasks.rawEvent.empty")}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCopyEventId} disabled={!event?.id}>
            {t("tasks.rawEvent.actions.copyEventId")}
          </Button>
          <Button type="button" variant="outline" onClick={handleCopyJson} disabled={!event}>
            {t("tasks.rawEvent.actions.copyJson")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("tasks.rawEvent.actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
