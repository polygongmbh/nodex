/**
 * Parse the `VITE_VIEWS` env var into a normalized, lowercased list of view-name
 * strings, or `null` when unset/empty (which means "all views enabled").
 *
 * Pure string handling only — the typed filtering against `VIEW_ORDER` lives in
 * `ViewSwitcher` so the canonical view order stays in one place (and to avoid an
 * import cycle).
 */
export function parseConfiguredViewNames(raw: string | undefined | null): string[] | null {
  if (raw == null) return null;
  const names = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return names.length > 0 ? names : null;
}

/** Configured view names from the build env, or null when unset (= all views). */
export const CONFIGURED_VIEW_NAMES = parseConfiguredViewNames(
  import.meta.env.VITE_VIEWS as string | undefined
);
