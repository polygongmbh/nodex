import { normalizeQuickFilterState } from "@/domain/content/quick-filter-constraints";
import { displayPriorityFromStored } from "@/domain/content/task-priority";
import { formatContextTaskTitle } from "@/lib/context-task-title";
import type { Channel, QuickFilterState, Relay } from "@/types";
import type { Person } from "@/types/person";

interface TranslateFn {
  (key: string, options?: Record<string, unknown>): string;
}

interface BuildEmptyScopeModelParams {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  quickFilters?: QuickFilterState;
  searchQuery?: string;
  contextTaskTitle?: string;
  locale: string;
  t: TranslateFn;
}

export interface EmptyScopeModel {
  hasActiveFilters: boolean;
  hasSelectedScope: boolean;
  scopeDescription: string | null;
  filteredSentence: string | null;
  scopeFooterSentence: string | null;
  mobileFallbackHint: string | null;
  loadingSentence: string | null;
  errorSentence: string | null;
  errorSubtitle: string;
  screenState: "default" | "loading" | "error";
}

function formatNaturalList(values: string[], locale: string): string {
  const formatter = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  return formatter.format(values);
}

function formatRelayLabel(relay: Relay): string {
  const rawValue = relay.url?.trim() || relay.name;
  if (!rawValue) return "";

  return rawValue.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
}

function resolveRelayStatus(relay: Relay): NonNullable<Relay["connectionStatus"]> | "connected" {
  if (relay.id === "demo" || !relay.connectionStatus) return "connected";
  return relay.connectionStatus;
}

export function buildEmptyScopeModel({
  relays,
  channels,
  people,
  quickFilters,
  searchQuery = "",
  contextTaskTitle = "",
  locale,
  t,
}: BuildEmptyScopeModelParams): EmptyScopeModel {
  const trimmedSearchQuery = searchQuery.trim();
  const normalizedQuickFilters = normalizeQuickFilterState(quickFilters);
  const displayPriority = displayPriorityFromStored(normalizedQuickFilters.minPriority) ?? 1;
  const formattedContextTitle = formatContextTaskTitle(contextTaskTitle);
  const activeRelays = relays.filter((relay) => relay.isActive);
  const includedChannels = channels.filter((channel) => channel.filterState === "included");
  const excludedChannels = channels.filter((channel) => channel.filterState === "excluded");
  const activePeople = people.filter((person) => person.isSelected);
  const activeRelayStatuses = activeRelays.map((relay) => resolveRelayStatus(relay));
  const hasRelayConnection = activeRelayStatuses.some(
    (status) => status === "connected" || status === "read-only"
  );
  const hasRelayLoading = activeRelayStatuses.some((status) => status === "connecting");
  const hasReadRejected = activeRelayStatuses.some((status) => status === "verification-failed");
  const hasConnectionFailure = activeRelayStatuses.some(
    (status) => status === "disconnected" || status === "connection-error"
  );
  const hasRelayError = hasConnectionFailure || hasReadRejected;
  const errorSubtitle = hasReadRejected && hasConnectionFailure
    ? t("tasks.empty.error.mixed")
    : hasReadRejected
      ? t("tasks.empty.error.readRejected")
      : hasConnectionFailure
        ? t("tasks.empty.error.unableToConnect")
        : t("tasks.empty.error.action");
  const screenState: EmptyScopeModel["screenState"] =
    !hasRelayConnection && hasRelayLoading
      ? "loading"
      : !hasRelayConnection && !hasRelayLoading && hasRelayError
        ? "error"
        : "default";
  const hasRelayFilter = activeRelays.length > 0 && activeRelays.length < relays.length;
  const activeRelayLabels = activeRelays.map((relay) => formatRelayLabel(relay)).filter(Boolean);
  const hasRelaySelection = activeRelayLabels.length > 0;
  const hasActiveFilters =
    Boolean(trimmedSearchQuery) ||
    hasRelayFilter ||
    includedChannels.length > 0 ||
    excludedChannels.length > 0 ||
    activePeople.length > 0 ||
    normalizedQuickFilters.recentEnabled ||
    normalizedQuickFilters.priorityEnabled;
  const hasSelectedScope =
    Boolean(trimmedSearchQuery) ||
    hasRelaySelection ||
    includedChannels.length > 0 ||
    excludedChannels.length > 0 ||
    activePeople.length > 0 ||
    normalizedQuickFilters.recentEnabled ||
    normalizedQuickFilters.priorityEnabled ||
    Boolean(formattedContextTitle);

  if (!hasSelectedScope) {
    return {
      hasActiveFilters: false,
      hasSelectedScope: false,
      scopeDescription: null,
      filteredSentence: null,
      scopeFooterSentence: null,
      mobileFallbackHint: null,
      loadingSentence: t("tasks.empty.loading.none"),
      errorSentence: t("tasks.empty.error.none"),
      errorSubtitle,
      screenState,
    };
  }

  const scopeParts = [
    activePeople.length > 0
      ? t("tasks.empty.scope.people", {
          people: formatNaturalList(
            activePeople.map((person) => person.displayName || person.name || person.pubkey),
            locale
          ),
        })
      : null,
    includedChannels.length > 0
      ? t(
          screenState === "loading"
            ? "tasks.empty.scope.includedChannelsLoading"
            : "tasks.empty.scope.includedChannels",
          {
          channels: formatNaturalList(
            includedChannels.map((channel) => `#${channel.name}`),
            locale
          ),
          }
        )
      : null,
    excludedChannels.length > 0
      ? t("tasks.empty.scope.excludedChannels", {
          channels: formatNaturalList(
            excludedChannels.map((channel) => `#${channel.name}`),
            locale
          ),
        })
      : null,
    hasRelaySelection
      ? t("tasks.empty.scope.relays", {
          relays: formatNaturalList(activeRelayLabels, locale),
        })
      : null,
    trimmedSearchQuery
      ? t("tasks.empty.scope.search", { query: trimmedSearchQuery })
      : null,
    normalizedQuickFilters.recentEnabled
      ? t("tasks.empty.scope.recent", { days: normalizedQuickFilters.recentDays })
      : null,
    normalizedQuickFilters.priorityEnabled
      ? t("tasks.empty.scope.priority", { priority: displayPriority })
      : null,
    formattedContextTitle
      ? t("tasks.empty.scope.contextUnder", {
          title: formattedContextTitle,
        })
      : null,
  ].filter((value): value is string => Boolean(value));

  const scopeDescription = scopeParts.join(", ");
  const filteredSentence = scopeDescription
    ? t("tasks.empty.filtered.scopeOnly", { scope: scopeDescription })
    : null;
  const scopeFooterSentence = scopeDescription
    ? t("tasks.empty.filtered.showingOnlyScope", { scope: scopeDescription })
    : null;
  const loadingSentence = scopeDescription
    ? t("tasks.empty.loading.scopeOnly", { scope: scopeDescription })
    : t("tasks.empty.loading.none");
  const errorScopeDescription = activeRelayLabels.length > 0
    ? t("tasks.empty.scope.relaysError", {
        relays: formatNaturalList(activeRelayLabels, locale),
      })
    : null;
  const errorSentence = errorScopeDescription
    ? t("tasks.empty.error.scopeOnly", { scope: errorScopeDescription })
    : t("tasks.empty.error.none");

  return {
    hasActiveFilters,
    hasSelectedScope: true,
    scopeDescription,
    filteredSentence,
    scopeFooterSentence,
    mobileFallbackHint: scopeDescription
      ? t("tasks.empty.filtered.mobileFallbackScoped", { scope: scopeDescription })
      : t("tasks.empty.filtered.mobileFallback"),
    loadingSentence,
    errorSentence,
    errorSubtitle,
    screenState,
  };
}
