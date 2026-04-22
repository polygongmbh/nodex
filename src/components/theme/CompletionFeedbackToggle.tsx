import { Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CompletionFeedbackToggleProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

export function CompletionFeedbackToggle({ enabled, onToggle, className }: CompletionFeedbackToggleProps) {
  const { t } = useTranslation("shell");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 hover:bg-muted hover:text-foreground xl:h-10 xl:w-10", className)}
      onClick={onToggle}
      aria-label={enabled ? t("feedback.sound.on") : t("feedback.sound.off")}
      title={enabled ? t("feedback.sound.on") : t("feedback.sound.off")}
    >
      {enabled ? <Volume2 className="h-4 w-4 xl:h-5 xl:w-5" /> : <VolumeX className="h-4 w-4 xl:h-5 xl:w-5" />}
    </Button>
  );
}
