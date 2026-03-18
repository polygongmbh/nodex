import { Clock3, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { QuickFilterState } from "@/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface SidebarQuickConstraintRowProps {
  quickFilters: QuickFilterState;
  onRecentEnabledChange: (enabled: boolean) => void;
  onRecentDaysChange: (days: number) => void;
  onPriorityEnabledChange: (enabled: boolean) => void;
  onMinPriorityChange: (priority: number) => void;
  className?: string;
}

export function SidebarQuickConstraintRow({
  quickFilters,
  onRecentEnabledChange,
  onRecentDaysChange,
  onPriorityEnabledChange,
  onMinPriorityChange,
  className,
}: SidebarQuickConstraintRowProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("grid grid-cols-2 gap-1 pb-1", className)}>
      <div
        className={cn(
          "rounded-md border px-1.5 py-1",
          quickFilters.recentEnabled
            ? "border-primary/60 bg-primary/10"
            : "border-border/60 bg-muted/35"
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => onRecentEnabledChange(!quickFilters.recentEnabled)}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate rounded-sm text-[11px] font-medium",
              quickFilters.recentEnabled ? "text-primary" : "text-muted-foreground"
            )}
            aria-pressed={quickFilters.recentEnabled}
            aria-label={t("sidebar.quickFilters.actions.toggleRecent")}
            title={t("sidebar.quickFilters.actions.toggleRecent")}
          >
            <Clock3 className="h-3 w-3 shrink-0" />
            <span className="truncate">{t("sidebar.quickFilters.labels.recent")}</span>
          </button>
          <Input
            type="number"
            min={1}
            max={365}
            value={quickFilters.recentDays}
            onChange={(event) => onRecentDaysChange(Number(event.target.value))}
            className="h-6 w-14 px-1.5 text-[11px]"
            aria-label={t("sidebar.quickFilters.labels.recentDays")}
            title={t("sidebar.quickFilters.labels.recentDays")}
          />
        </div>
      </div>

      <div
        className={cn(
          "rounded-md border px-1.5 py-1",
          quickFilters.priorityEnabled
            ? "border-primary/60 bg-primary/10"
            : "border-border/60 bg-muted/35"
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => onPriorityEnabledChange(!quickFilters.priorityEnabled)}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate rounded-sm text-[11px] font-medium",
              quickFilters.priorityEnabled ? "text-primary" : "text-muted-foreground"
            )}
            aria-pressed={quickFilters.priorityEnabled}
            aria-label={t("sidebar.quickFilters.actions.toggleImportant")}
            title={t("sidebar.quickFilters.actions.toggleImportant")}
          >
            <Flag className="h-3 w-3 shrink-0" />
            <span className="truncate">{t("sidebar.quickFilters.labels.important")}</span>
          </button>
          <Input
            type="number"
            min={0}
            max={100}
            value={quickFilters.minPriority}
            onChange={(event) => onMinPriorityChange(Number(event.target.value))}
            className="h-6 w-14 px-1.5 text-[11px]"
            aria-label={t("sidebar.quickFilters.labels.minPriority")}
            title={t("sidebar.quickFilters.labels.minPriority")}
          />
        </div>
      </div>
    </div>
  );
}
