import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";

interface FilteredEmptyStateProps {
  isHydrating?: boolean;
  searchQuery?: string;
  contextTaskTitle?: string;
  className?: string;
}

export function FilteredEmptyState({
  isHydrating = false,
  searchQuery: searchQueryProp,
  contextTaskTitle = "",
  className,
}: FilteredEmptyStateProps) {
  const { t } = useTranslation();
  const surface = useFeedSurfaceState();
  const searchQuery = searchQueryProp ?? surface.searchQuery;
  const scopeModel = useEmptyScopeModel({
    relays: surface.relays,
    channels: surface.channels,
    people: surface.people,
    quickFilters: surface.quickFilters,
    searchQuery,
    contextTaskTitle,
  });
  const loadingSubtitle = useMemo(() => {
    const waitingPromptKeys = [
      "tasks.empty.loading.waitingPrompts.calmBreath",
      "tasks.empty.loading.waitingPrompts.glanceAway",
      "tasks.empty.loading.waitingPrompts.smallPause",
      "tasks.empty.loading.waitingPrompts.shoulderRoll",
      "tasks.empty.loading.waitingPrompts.syncBlinks",
      "tasks.empty.loading.waitingPrompts.unclenchExhale",
      "tasks.empty.loading.waitingPrompts.shortBeat",
      "tasks.empty.loading.waitingPrompts.postureSettle",
      "tasks.empty.loading.waitingPrompts.sipWater",
      "tasks.empty.loading.waitingPrompts.momentMore",
    ] as const;
    const index = Math.floor(Math.random() * waitingPromptKeys.length);
    return t(waitingPromptKeys[index]);
  }, [t]);
  const collectionTitle = useMemo(() => {
    const options = t("tasks.empty.options", {
      returnObjects: true,
    }) as string[];
    const index = Math.floor(Math.random() * options.length);
    return options[index];
  }, [t]);

  const shouldRenderOverlayScope = scopeModel.hasSelectedScope;
  const overlayTitle =
    isHydrating || scopeModel.screenState === "loading"
      ? isHydrating
        ? t("feed.hydrating")
        : scopeModel.loadingSentence
      : scopeModel.screenState === "error"
        ? scopeModel.errorSentence
        : shouldRenderOverlayScope
          ? scopeModel.filteredSentence
          : collectionTitle;
  const overlaySubtitle =
    isHydrating || scopeModel.screenState === "loading"
      ? loadingSubtitle
      : scopeModel.screenState === "error"
        ? scopeModel.errorSubtitle
        : shouldRenderOverlayScope
          ? t("tasks.empty.filtered.action")
          : null;

  return (
    <div
      role="status"
      className={cn("absolute inset-x-0 bottom-4 z-10 flex justify-center px-4", className)}
    >
      <div className="pointer-events-none max-w-2xl select-text rounded-2xl border border-border/70 bg-background/90 px-5 py-4 text-center shadow-lg backdrop-blur-sm sm:px-6 sm:py-5">
        <p className="text-base font-medium leading-relaxed text-foreground sm:text-lg">
          {overlayTitle}
        </p>
        {overlaySubtitle ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {overlaySubtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
