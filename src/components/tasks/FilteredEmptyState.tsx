import { useTranslation } from "react-i18next";
import { useDeferredValue, useMemo } from "react";
import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { Button } from "@/components/ui/button";

export function FilteredEmptyState() {
  const { t } = useTranslation("tasks");
  const surface = useFeedSurfaceState();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { isHydrating = false, focusedTaskId, allTasks } = useFeedTaskViewModel();
  const searchQuery = useDeferredValue(surface.searchQuery);
  const contextTaskTitle = focusedTaskId
    ? allTasks.find((task) => task.id === focusedTaskId)?.content ?? ""
    : "";
  const scopeModel = useEmptyScopeModel({
    relays: surface.relays,
    channels: surface.channels,
    people: surface.people,
    quickFilters: surface.quickFilters,
    searchQuery,
    contextTaskTitle,
    focusedTaskId,
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
  const isLoading = isHydrating || scopeModel.screenState === "loading";
  const isError = !isLoading && scopeModel.screenState === "error";
  const overlayTitle = isLoading
    ? isHydrating
      ? t("feed.hydrating")
      : scopeModel.loadingSentence
    : isError
      ? scopeModel.errorSentence
      : shouldRenderOverlayScope
        ? scopeModel.filteredSentence
        : collectionTitle;
  const overlaySubtitle = isLoading
    ? loadingSubtitle
    : isError
      ? scopeModel.errorSubtitle
      : shouldRenderOverlayScope
        ? t("tasks.empty.filtered.action")
        : null;

  const showClearFiltersAction = !isLoading && !isError && scopeModel.hasActiveFilters;

  const handleClearFilters = () => {
    void dispatchFeedInteraction({ type: "filter.resetAll" });
    if (surface.searchQuery) {
      void dispatchFeedInteraction({ type: "ui.search.change", query: "" });
    }
    if (focusedTaskId) {
      void dispatchFeedInteraction({ type: "task.focus.change", taskId: null });
    }
  };

  return (
    <div
      role="status"
      className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4"
    >
      <div className="pointer-events-auto max-w-2xl select-text rounded-2xl border border-border/70 bg-background/90 px-5 py-4 text-center shadow-lg backdrop-blur-sm sm:px-6 sm:py-5">
        <p className="text-base font-medium leading-relaxed text-foreground sm:text-lg">
          {overlayTitle}
        </p>
        {overlaySubtitle ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {overlaySubtitle}
          </p>
        ) : null}
        {showClearFiltersAction ? (
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClearFilters}
            >
              {t("tasks.empty.filtered.clearAll")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
