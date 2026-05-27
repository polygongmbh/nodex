import { useTranslation } from "react-i18next";

interface TaskShowMoreToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function TaskShowMoreToggle({ isExpanded, onToggle, className }: TaskShowMoreToggleProps) {
  const { t } = useTranslation("tasks");
  return (
    <button
      type="button"
      className={className ?? "mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {isExpanded ? t("tasks.actions.showLess") : t("tasks.actions.showMore")}
    </button>
  );
}
