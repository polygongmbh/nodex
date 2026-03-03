import { RotateCcw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FailedPublishDraft } from "@/lib/failed-publish-drafts";
import { useTranslation } from "react-i18next";

interface FailedPublishQueueBannerProps {
  drafts: FailedPublishDraft[];
  selectedFeedDrafts?: FailedPublishDraft[];
  onRetry: (draftId: string) => void;
  onRepost?: (draftId: string) => void;
  onDismiss: (draftId: string) => void;
  onDismissAll?: () => void;
  isMobile?: boolean;
}

export function FailedPublishQueueBanner({
  drafts,
  selectedFeedDrafts,
  onRetry,
  onRepost,
  onDismiss,
  onDismissAll,
  isMobile = false,
}: FailedPublishQueueBannerProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const scopedSelectedDrafts = selectedFeedDrafts ?? drafts;
  const hasScopeToggle = selectedFeedDrafts !== undefined;
  const activeDrafts = useMemo(
    () => (scope === "all" ? drafts : scopedSelectedDrafts),
    [drafts, scope, scopedSelectedDrafts]
  );
  const hiddenCount = Math.max(0, drafts.length - scopedSelectedDrafts.length);
  if (drafts.length === 0) return null;
  const visibleDrafts = activeDrafts.slice(0, 4);
  return (
    <div className={cn("border-b border-destructive/40 bg-destructive/10", isMobile ? "px-3 py-2" : "px-4 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-destructive">
          {t("publishQueue.failedCount", { count: activeDrafts.length })}
        </p>
        {onDismissAll && activeDrafts.length > 0 && (
          <button
            type="button"
            onClick={onDismissAll}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
            title={t("publishQueue.dismissAll")}
            aria-label={t("publishQueue.dismissAll")}
          >
            {t("publishQueue.dismissAll")}
          </button>
        )}
      </div>
      {hasScopeToggle && (
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScope("selected")}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              scope === "selected" ? "bg-destructive/20 text-destructive" : "text-destructive/80 hover:bg-destructive/10"
            )}
          >
            {t("publishQueue.scopeSelected")}
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              scope === "all" ? "bg-destructive/20 text-destructive" : "text-destructive/80 hover:bg-destructive/10"
            )}
          >
            {t("publishQueue.scopeAll")}
          </button>
          {scope === "selected" && hiddenCount > 0 && (
            <span className="text-[11px] text-destructive/80">
              {t("publishQueue.hiddenCount", { count: hiddenCount })}
            </span>
          )}
        </div>
      )}
      <div className="mt-2 space-y-2">
        {visibleDrafts.map((draft) => (
          <div
            key={draft.id}
            className="flex items-center justify-between gap-2 rounded border border-destructive/30 bg-background/80 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs text-foreground">{draft.content}</p>
              <p className="truncate text-xs text-destructive/90">
                {draft.tags.map((tag) => `#${tag}`).join(" ")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onRetry(draft.id)}
                className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
                title={t("publishQueue.retryHint")}
                aria-label={t("publishQueue.retryHint")}
              >
                <span className="inline-flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  {t("publishQueue.retry")}
                </span>
              </button>
              {onRepost && (
                <button
                  type="button"
                  onClick={() => onRepost(draft.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
                  title={t("publishQueue.repostHint")}
                  aria-label={t("publishQueue.repostHint")}
                >
                  {t("publishQueue.repost")}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(draft.id)}
                className="rounded p-1 text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
                title={t("publishQueue.dismiss")}
                aria-label={t("publishQueue.dismiss")}
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
