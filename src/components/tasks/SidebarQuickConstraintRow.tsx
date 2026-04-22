import { Clock3, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { QuickFilterState } from "@/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import {
  MAX_RECENT_DAYS_DIGITS,
  displayPriorityFromStored,
  storedPriorityFromDisplay,
} from "@/domain/content/task-priority";

interface SidebarQuickConstraintRowProps {
  quickFilters: QuickFilterState;
  className?: string;
}

export function SidebarQuickConstraintRow({
  quickFilters,
  className,
}: SidebarQuickConstraintRowProps) {
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const displayedMinPriority = displayPriorityFromStored(quickFilters.minPriority) ?? 1;
  const getNumericInputWidth = (maxDigits: number, value: string) => `${Math.max(maxDigits, value.length) + 1.5}ch`;
  const sharedNumericInputWidth = getNumericInputWidth(MAX_RECENT_DAYS_DIGITS, String(quickFilters.recentDays));

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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void dispatchFeedInteraction({
                type: "sidebar.quickFilter.recentEnabled.change",
                enabled: !quickFilters.recentEnabled,
              });
            }}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate rounded-sm text-[11px] font-medium",
              quickFilters.recentEnabled ? "text-primary" : "text-muted-foreground"
            )}
            aria-pressed={quickFilters.recentEnabled}
            aria-label={t("sidebar.quickFilters.actions.toggleRecent", { days: quickFilters.recentDays })}
            title={t("sidebar.quickFilters.actions.toggleRecent", { days: quickFilters.recentDays })}
          >
            <Clock3 className="h-3 w-3 shrink-0" />
            <span className="hidden truncate lg:inline">{t("sidebar.quickFilters.labels.recent")}</span>
          </button>
          <Input
            type="number"
            min={1}
            max={365}
            value={quickFilters.recentDays}
            onChange={(event) => {
              void dispatchFeedInteraction({
                type: "sidebar.quickFilter.recentDays.change",
                days: Number(event.target.value),
              });
            }}
            className="h-6 px-1.5 text-[11px]"
            style={{ width: sharedNumericInputWidth }}
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void dispatchFeedInteraction({
                type: "sidebar.quickFilter.priorityEnabled.change",
                enabled: !quickFilters.priorityEnabled,
              });
            }}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate rounded-sm text-[11px] font-medium",
              quickFilters.priorityEnabled ? "text-primary" : "text-muted-foreground"
            )}
            aria-pressed={quickFilters.priorityEnabled}
            aria-label={t("sidebar.quickFilters.actions.togglePriority")}
            title={t("sidebar.quickFilters.actions.togglePriority")}
          >
            <Flag className="h-3 w-3 shrink-0" />
            <span className="hidden truncate lg:inline">{t("sidebar.quickFilters.labels.priority")}</span>
          </button>
          <Input
            type="number"
            min={1}
            max={5}
            value={displayedMinPriority}
            onChange={(event) => {
              const storedPriority = storedPriorityFromDisplay(Number(event.target.value));
              if (typeof storedPriority !== "number") return;
              void dispatchFeedInteraction({
                type: "sidebar.quickFilter.minPriority.change",
                priority: storedPriority,
              });
            }}
            className="h-6 px-1.5 text-[11px]"
            style={{ width: sharedNumericInputWidth }}
            aria-label={t("sidebar.quickFilters.labels.minPriority")}
            title={t("sidebar.quickFilters.labels.minPriority")}
          />
        </div>
      </div>
    </div>
  );
}
