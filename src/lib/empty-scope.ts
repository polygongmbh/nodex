import type { Channel, Person, Relay } from "@/types";

interface TranslateFn {
  (key: string, options?: Record<string, unknown>): string;
}

interface BuildEmptyScopeModelParams {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  searchQuery?: string;
  contextTaskTitle?: string;
  locale: string;
  t: TranslateFn;
}

export interface EmptyScopeModel {
  hasActiveFilters: boolean;
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
  searchQuery = "",
  contextTaskTitle = "",
  locale,
  t,
}: BuildEmptyScopeModelParams): EmptyScopeModel {
  const trimmedSearchQuery = searchQuery.trim();
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
  const hasActiveFilters =
    Boolean(trimmedSearchQuery) ||
    hasRelayFilter ||
    includedChannels.length > 0 ||
    excludedChannels.length > 0 ||
    activePeople.length > 0;

  if (!hasActiveFilters) {
    return {
      hasActiveFilters: false,
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
    activePeople.length > 0
      ? t("tasks.empty.scope.people", {
          people: formatNaturalList(
            activePeople.map((person) => person.displayName || person.name || person.id),
            locale
          ),
        })
      : null,
    excludedChannels.length > 0
      ? t("tasks.empty.scope.excludedChannels", {
          channels: formatNaturalList(
            excludedChannels.map((channel) => `#${channel.name}`),
            locale
          ),
        })
      : null,
    hasRelayFilter && activeRelayLabels.length > 0
      ? t("tasks.empty.scope.relays", {
          relays: formatNaturalList(activeRelayLabels, locale),
        })
      : null,
    trimmedSearchQuery
      ? t("tasks.empty.scope.search", { query: trimmedSearchQuery })
      : null,
    contextTaskTitle.trim()
      ? t("tasks.empty.scope.contextUnder", {
          title: contextTaskTitle.trim(),
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
    hasActiveFilters: true,
    scopeDescription,
    filteredSentence,
    scopeFooterSentence,
    mobileFallbackHint: t("tasks.empty.filtered.mobileFallback"),
    loadingSentence,
    errorSentence,
    errorSubtitle,
    screenState,
  };
}
