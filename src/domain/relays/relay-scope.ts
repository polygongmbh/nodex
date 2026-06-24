interface RelayScopedTaskLike {
  relays: string[];
}

/**
 * The app-wide relay-scope rule: an empty active selection means "All spaces"
 * (no relay filter), not "no relays". This is the single source of truth for
 * that decision — channels, the feed, sidebar people, and pins all read it so
 * none of them reintroduce the "empty === none" trap that silently empties a
 * surface whenever the user clears the relay filter.
 */
export function hasActiveRelayScope(
  scope: ReadonlySet<string> | readonly string[]
): boolean {
  return (scope instanceof Set ? scope.size : scope.length) > 0;
}

/**
 * Resolve the effective relay scope as a list: the active selection when one
 * exists, otherwise `getFullScope()` (the all-spaces fallback). `getFullScope`
 * is lazy so callers only pay for it in the empty case, and each caller decides
 * what "all" concretely means — every configured relay, every relay with
 * content, every cached bucket. Tokens may be relay IDs or relay URLs.
 */
export function resolveRelayScope(
  activeScope: ReadonlySet<string> | readonly string[],
  getFullScope: () => readonly string[]
): string[] {
  if (hasActiveRelayScope(activeScope)) return Array.from(activeScope);
  return Array.from(getFullScope());
}

export function resolveChannelRelayScopeIds(
  effectiveActiveRelayIds: Set<string>,
  availableRelayIds: string[]
): Set<string> {
  return new Set(resolveRelayScope(effectiveActiveRelayIds, () => availableRelayIds));
}

export function isTaskOutsideSelectedRelayScope(
  task: RelayScopedTaskLike | null | undefined,
  effectiveActiveRelayIds: Set<string>,
  availableRelayIds: string[]
): boolean {
  if (!task || task.relays.length === 0) {
    return false;
  }

  const relayScopeIds = resolveChannelRelayScopeIds(
    effectiveActiveRelayIds,
    availableRelayIds
  );
  return !task.relays.some((relayId) => relayScopeIds.has(relayId));
}
