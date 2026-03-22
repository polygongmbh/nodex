export type MobileFallbackNoticeType = "none" | "scope" | "quick";

interface ResolveMobileFallbackNoticeParams {
  hasSourceContent: boolean;
  hasScopeFilters: boolean;
  hasScopedMatchesWithSearch: boolean;
  hasScopedMatchesWithoutSearch: boolean;
  hasSearchQuery: boolean;
}

export function resolveMobileFallbackNoticeType({
  hasSourceContent,
  hasScopeFilters,
  hasScopedMatchesWithSearch,
  hasScopedMatchesWithoutSearch,
  hasSearchQuery,
}: ResolveMobileFallbackNoticeParams): MobileFallbackNoticeType {
  if (!hasSourceContent) return "none";

  if (hasScopeFilters && !hasScopedMatchesWithoutSearch) {
    return "scope";
  }

  if (hasSearchQuery && !hasScopedMatchesWithSearch && hasScopedMatchesWithoutSearch) {
    return "quick";
  }

  return "none";
}
