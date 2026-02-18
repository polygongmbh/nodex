import { Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface CompletionFeedbackToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function CompletionFeedbackToggle({ enabled, onToggle }: CompletionFeedbackToggleProps) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={onToggle}
      aria-label={enabled ? t("feedback.sound.on") : t("feedback.sound.off")}
      title={enabled ? t("feedback.sound.on") : t("feedback.sound.off")}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </Button>
  );
}
