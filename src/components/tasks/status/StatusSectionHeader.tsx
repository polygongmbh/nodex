import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import type { ViewType } from "@/components/tasks/ViewSwitcher";

interface StatusSectionHeaderProps {
  label: string;
  targetView: ViewType;
  createIcon?: React.ReactNode;
  canCreate?: boolean;
  onCreate?: () => void;
}

/**
 * Compact section header used by the status and home panels: the label
 * navigates to the section's full view, the optional icon opens an inline
 * composer.
 */
export function StatusSectionHeader({
  label,
  targetView,
  createIcon,
  canCreate = false,
  onCreate,
}: StatusSectionHeaderProps) {
  const { t } = useTranslation("tasks");
  const dispatch = useFeedInteractionDispatch();
  return (
    <div className="flex h-8 items-center border-b border-border bg-muted/30 pl-3 pr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground flex-shrink-0">
      <button
        type="button"
        onClick={() => void dispatch({ type: "ui.view.change", view: targetView })}
        className="flex-1 text-left hover:text-foreground transition-colors"
        title={t("status.showView", { view: label })}
      >
        {label}
      </button>
      {canCreate && createIcon && onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="relative p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
          title={t("status.headerCreate")}
        >
          {createIcon}
          <Plus
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-muted/80"
            strokeWidth={3}
          />
        </button>
      )}
    </div>
  );
}
