export function resolveChannelRelayScopeIds(
  effectiveActiveRelayIds: Set<string>,
  availableRelayIds: string[]
): Set<string> {
  if (effectiveActiveRelayIds.size > 0) {
    return new Set(effectiveActiveRelayIds);
  }
  return new Set(availableRelayIds);
}
