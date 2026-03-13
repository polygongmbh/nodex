export function resolveChannelRelayScopeIds(
  effectiveActiveRelayIds: Set<string>,
  availableRelayIds: string[]
): Set<string> {
  if (effectiveActiveRelayIds.size > 0) {
    return new Set(effectiveActiveRelayIds);
  }
  return new Set(availableRelayIds);
}

interface RelayScopedTaskLike {
  relays: string[];
}

export function isTaskOutsideSelectedRelayScope(
  task: RelayScopedTaskLike | null | undefined,
  effectiveActiveRelayIds: Set<string>,
  availableRelayIds: string[]
): boolean {
  if (!task || task.relays.length === 0) {
    return false;
  }

  const relayScopeIds = resolveChannelRelayScopeIds(effectiveActiveRelayIds, availableRelayIds);
  return !task.relays.some((relayId) => relayScopeIds.has(relayId));
}
