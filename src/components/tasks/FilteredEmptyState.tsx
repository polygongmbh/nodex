import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Channel, QuickFilterState, Relay } from "@/types";
import type { Person } from "@/types/person";
import { useEmptyScopeModel } from "@/features/feed-page/controllers/use-empty-scope-model";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";

interface FilteredEmptyStateProps {
  relays?: Relay[];
  channels?: Channel[];
  people?: Person[];
  quickFilters?: QuickFilterState;
  isHydrating?: boolean;
  searchQuery?: string;
  contextTaskTitle?: string;
  mode?: "screen" | "inline" | "mobile" | "footer" | "overlay";
  className?: string;
}

export function FilteredEmptyState({
  relays: relaysProp,
  channels: channelsProp,
  people: peopleProp,
  quickFilters: quickFiltersProp,
  isHydrating = false,
  searchQuery: searchQueryProp,
  contextTaskTitle = "",
  mode = "screen",
  className,
}: FilteredEmptyStateProps) {
  const { t } = useTranslation();
  const surface = useFeedSurfaceState();
  const relays = relaysProp ?? surface.relays;
  const channels = channelsProp ?? surface.channels;
  const people = peopleProp ?? surface.people;
  const quickFilters = quickFiltersProp ?? surface.quickFilters;
  const searchQuery = searchQueryProp ?? surface.searchQuery;
  const scopeModel = useEmptyScopeModel({
    relays,
    channels,
    people,
    quickFilters,
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

  if (mode === "screen" && (isHydrating || scopeModel.screenState === "loading")) {
    return (
      <div
        data-empty-mode="screen"
        className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
      >
        <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">
          {isHydrating ? t("feed.hydrating") : scopeModel.loadingSentence}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {loadingSubtitle}
        </p>
      </div>
    );
  }

  if (mode === "screen" && scopeModel.screenState === "error") {
    return (
      <div
        data-empty-mode="screen"
        className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
      >
        <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">
          {scopeModel.errorSentence}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {scopeModel.errorSubtitle}
        </p>
      </div>
    );
  }

  const shouldRenderScopedState = mode === "footer"
    ? scopeModel.hasSelectedScope
    : scopeModel.hasActiveFilters;

  if (mode === "overlay") {
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
        data-empty-mode="overlay"
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

  if (shouldRenderScopedState) {
    if (mode === "mobile") {
      return (
        <div
          data-empty-mode="mobile"
          className={cn("mx-auto w-full px-3 pt-2 pb-1 text-center text-xs leading-snug text-muted-foreground", className)}
        >
          {scopeModel.mobileFallbackHint}
        </div>
      );
    }

    if (mode === "inline") {
      return (
        <div
          data-empty-mode="inline"
          className={cn("flex min-h-full items-end justify-center px-4 py-6 text-center", className)}
        >
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {scopeModel.filteredSentence}
          </p>
        </div>
      );
    }

    if (mode === "footer") {
      return (
        <div
          data-empty-mode="footer"
          className={cn("flex justify-center px-4 py-6 text-center", className)}
        >
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {scopeModel.scopeFooterSentence}
          </p>
        </div>
      );
    }

    return (
      <div
        className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
      >
        <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">
          {scopeModel.filteredSentence}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("tasks.empty.filtered.action")}
        </p>
      </div>
    );
  }

  return (
    <div
      data-empty-mode="screen"
      className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">{collectionTitle}</p>
    </div>
  );
}
