import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Channel, Person, Relay } from "@/types";

interface FilteredEmptyStateProps {
  variant: "feed" | "collection";
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  searchQuery?: string;
  className?: string;
}

function summarizeScopeGroup(label: string, values: string[]): string | null {
  if (values.length === 0) return null;
  if (values.length === 1) return `${label}: ${values[0]}`;
  return `${label}: ${values[0]} +${values.length - 1}`;
}

export function FilteredEmptyState({
  variant,
  relays,
  channels,
  people,
  searchQuery = "",
  className,
}: FilteredEmptyStateProps) {
  const { t } = useTranslation();
  const trimmedSearchQuery = searchQuery.trim();
  const activeRelays = relays.filter((relay) => relay.isActive);
  const activeChannels = channels.filter((channel) => channel.filterState !== "neutral");
  const activePeople = people.filter((person) => person.isSelected);
  const hasRelayFilter = activeRelays.length > 0 && activeRelays.length < relays.length;
  const hasActiveFilters =
    Boolean(trimmedSearchQuery) ||
    hasRelayFilter ||
    activeChannels.length > 0 ||
    activePeople.length > 0;

  const scopeSummary = useMemo(() => {
    if (!hasActiveFilters) return null;

    const parts = [
      hasRelayFilter
        ? summarizeScopeGroup(
            t("sidebar.sections.feeds"),
            activeRelays.map((relay) => relay.name)
          )
        : null,
      activeChannels.length > 0
        ? summarizeScopeGroup(
            t("sidebar.sections.channels"),
            activeChannels.map((channel) => `#${channel.name}`)
          )
        : null,
      activePeople.length > 0
        ? summarizeScopeGroup(
            t("sidebar.sections.people"),
            activePeople.map((person) => person.displayName || person.name || person.id)
          )
        : null,
      trimmedSearchQuery ? t("tasks.empty.scope.search", { query: trimmedSearchQuery }) : null,
    ].filter((value): value is string => Boolean(value));

    return parts.join(" · ");
  }, [activeChannels, activePeople, activeRelays, hasActiveFilters, hasRelayFilter, t, trimmedSearchQuery]);

  const title = hasActiveFilters
    ? t("tasks.empty.filtered.title")
    : variant === "feed"
      ? t("tasks.empty.unfiltered.feedTitle")
      : t("tasks.empty.unfiltered.collectionTitle");

  const description = hasActiveFilters
    ? (scopeSummary ? t("tasks.empty.filtered.scope", { scope: scopeSummary }) : null)
    : variant === "feed"
      ? t("tasks.empty.unfiltered.feedDescription")
      : null;

  const action = hasActiveFilters ? t("tasks.empty.filtered.action") : null;

  return (
    <div className={cn("px-4 py-10 text-center text-muted-foreground", className)}>
      <p className="text-sm font-medium text-foreground/90">{title}</p>
      {description ? <p className="mt-2 text-sm">{description}</p> : null}
      {action ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground/80">{action}</p> : null}
    </div>
  );
}
