import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { buildEmptyScopeModel } from "@/lib/empty-scope";
import type { Channel, Person, Relay } from "@/types";

interface FilteredEmptyStateProps {
  variant: "feed" | "collection";
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  searchQuery?: string;
  mode?: "screen" | "inline" | "mobile";
  className?: string;
}

export function FilteredEmptyState({
  variant,
  relays,
  channels,
  people,
  searchQuery = "",
  mode = "screen",
  className,
}: FilteredEmptyStateProps) {
  const { t, i18n } = useTranslation();
  const scopeModel = buildEmptyScopeModel({
    relays,
    channels,
    people,
    searchQuery,
    locale: i18n.resolvedLanguage || i18n.language || "en",
    t,
  });
  const loadingSubtitle = useMemo(() => {
    const easterEggKeys = [
      "tasks.empty.loading.easterEggs.glanceWindow",
      "tasks.empty.loading.easterEggs.stretch",
      "tasks.empty.loading.easterEggs.water",
    ] as const;
    const index = Math.floor(Math.random() * easterEggKeys.length);
    return t(easterEggKeys[index]);
  }, [t]);

  if (mode === "screen" && scopeModel.screenState === "loading") {
    return (
      <div
        className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
        data-testid="filtered-empty-screen"
      >
        <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">
          {scopeModel.loadingSentence}
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
        data-testid="filtered-empty-screen"
      >
        <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">
          {scopeModel.errorSentence}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("tasks.empty.error.action")}
        </p>
      </div>
    );
  }

  if (scopeModel.hasActiveFilters) {
    if (mode === "mobile") {
      return (
        <div
          className={cn("px-3 pt-2 pb-1 text-center text-xs leading-snug text-muted-foreground", className)}
          data-testid="filtered-empty-mobile-hint"
        >
          {scopeModel.mobileFallbackHint}
        </div>
      );
    }

    if (mode === "inline") {
      return (
        <div
          className={cn("flex min-h-full items-end justify-center px-4 py-6 text-center", className)}
          data-testid="filtered-empty-inline"
        >
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {scopeModel.filteredSentence}
          </p>
        </div>
      );
    }

    return (
      <div
        className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
        data-testid="filtered-empty-screen"
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

  const title = variant === "feed"
    ? t("tasks.empty.unfiltered.feedTitle")
    : t("tasks.empty.unfiltered.collectionTitle");
  const description = variant === "feed"
    ? t("tasks.empty.unfiltered.feedDescription")
    : null;

  return (
    <div
      className={cn("flex min-h-full flex-col items-center justify-center px-6 py-12 text-center", className)}
      data-testid="filtered-empty-screen"
    >
      <p className="max-w-3xl text-lg leading-relaxed text-foreground sm:text-2xl">{title}</p>
      {description ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}
