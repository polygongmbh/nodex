import { Loader2, RotateCcw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";
import { useTranslation } from "react-i18next";
import { relayUrlToId } from "@/infrastructure/nostr/relay-url";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface FailedPublishQueueBannerProps {
  drafts: FailedPublishDraft[];
  selectedFeedDrafts?: FailedPublishDraft[];
  selectedRelayIds?: string[];
  isMobile?: boolean;
}

export function FailedPublishQueueBanner({
  drafts,
  selectedFeedDrafts,
  selectedRelayIds = [],
  isMobile = false,
}: FailedPublishQueueBannerProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [pendingActionByDraftId, setPendingActionByDraftId] = useState<Record<string, "retry" | "repost" | undefined>>({});
  const selectedRelayIdSet = useMemo(() => new Set(selectedRelayIds), [selectedRelayIds]);
  const scopedSelectedDrafts = selectedFeedDrafts ?? drafts;
  const hasScopeToggle = selectedFeedDrafts !== undefined;
  const activeDrafts = useMemo(
    () => (scope === "all" ? drafts : scopedSelectedDrafts),
    [drafts, scope, scopedSelectedDrafts]
  );
  const hiddenCount = Math.max(0, drafts.length - scopedSelectedDrafts.length);
  if (drafts.length === 0) return null;
  const visibleDrafts = activeDrafts.slice(0, 4);

  const getOriginalRelayIds = (draft: FailedPublishDraft): string[] => {
    if (draft.relayIds.length > 0) return draft.relayIds;
    return draft.relayUrls.map((url) => relayUrlToId(url));
  };

  const handleRetry = async (draftId: string) => {
    setPendingActionByDraftId((previous) => ({ ...previous, [draftId]: "retry" }));
    try {
      await dispatchFeedInteraction({ type: "publish.failed.retry", draftId });
    } finally {
      setPendingActionByDraftId((previous) => ({ ...previous, [draftId]: undefined }));
    }
  };

  const handleRepost = async (draftId: string) => {
    setPendingActionByDraftId((previous) => ({ ...previous, [draftId]: "repost" }));
    try {
      await dispatchFeedInteraction({ type: "publish.failed.repost", draftId });
    } finally {
      setPendingActionByDraftId((previous) => ({ ...previous, [draftId]: undefined }));
    }
  };

  return (
    <div className={cn("border-b border-destructive/40 bg-destructive/10", isMobile ? "px-3 py-2" : "px-4 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-destructive">
          {t("publishQueue.failedCount", { count: activeDrafts.length })}
        </p>
        {activeDrafts.length > 0 && (
          <button
            type="button"
            onClick={() => {
              void dispatchFeedInteraction({ type: "publish.failed.dismissAll" });
            }}
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
            {(() => {
              const originalRelayIds = getOriginalRelayIds(draft);
              const canRetry = originalRelayIds.some((relayId) => selectedRelayIdSet.has(relayId));
              const canRepost = selectedRelayIds.some((relayId) => !originalRelayIds.includes(relayId));
              const pendingAction = pendingActionByDraftId[draft.id];
              const isPending = Boolean(pendingAction);
              return (
                <>
            <div className="min-w-0">
              <p className="truncate text-xs text-foreground">{draft.content}</p>
              <p className="truncate text-xs text-destructive/90">
                {draft.tags.map((tag) => `#${tag}`).join(" ")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleRetry(draft.id)}
                disabled={!canRetry || isPending}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium text-destructive transition-colors",
                  canRetry && !isPending
                    ? "hover:bg-destructive/15"
                    : "cursor-not-allowed opacity-50"
                )}
                title={canRetry ? t("publishQueue.retryHint") : t("publishQueue.retryUnavailable")}
                aria-label={t("publishQueue.retryHint")}
              >
                <span className="inline-flex items-center gap-1">
                  {pendingAction === "retry" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  {pendingAction === "retry" ? t("publishQueue.retrying") : t("publishQueue.retry")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleRepost(draft.id)}
                disabled={!canRepost || isPending}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium text-destructive transition-colors",
                  canRepost && !isPending
                    ? "hover:bg-destructive/15"
                    : "cursor-not-allowed opacity-50"
                )}
                title={canRepost ? t("publishQueue.repostHint") : t("publishQueue.repostUnavailable")}
                aria-label={t("publishQueue.repostHint")}
              >
                {pendingAction === "repost" ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("publishQueue.reposting")}
                  </span>
                ) : (
                  t("publishQueue.repost")
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  void dispatchFeedInteraction({ type: "publish.failed.dismiss", draftId: draft.id });
                }}
                disabled={isPending}
                className="rounded p-1 text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
                title={t("publishQueue.dismiss")}
                aria-label={t("publishQueue.dismiss")}
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
