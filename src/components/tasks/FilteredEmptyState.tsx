import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Channel, Person, QuickFilterState, Relay } from "@/types";
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
  mode?: "screen" | "inline" | "mobile" | "footer";
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
    const options = t("tasks.empty.unfiltered.collectionTitleOptions", {
      returnObjects: true,
      defaultValue: [],
    });
    if (Array.isArray(options) && options.length > 0) {
      const index = Math.floor(Math.random() * options.length);
      const selected = options[index];
      if (typeof selected === "string" && selected.length > 0) {
        return selected;
      }
    }
    return t("tasks.empty.unfiltered.collectionTitle");
  }, [t]);

  if (mode === "screen" && (isHydrating || scopeModel.screenState === "loading")) {
    return (
      <div
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
      className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">{collectionTitle}</p>
    </div>
  );
}
