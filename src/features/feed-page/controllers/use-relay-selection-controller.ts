import { useCallback, useEffect, useRef } from "react";
import type { Relay } from "@/types";
import { shouldReconnectRelayOnSelection } from "@/domain/relays/relay-reconnect-policy";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { notifyRelayReconnectFailed, notifyRelayReconnectAttempt } from "@/lib/notifications";
import { getRelayDomain, useRelayFilterState } from "./use-relay-filter-state";

type RelaySelectionMode = "toggle" | "exclusive";

interface UseRelaySelectionControllerOptions {
  relays: Relay[];
  reconnectFailureGraceMs?: number;
}

interface PendingReconnectSelection {
  relayId: string;
  sawRecoveringState: boolean;
  timeoutId: number;
}

const RECOVERING_STATUSES = new Set<NonNullable<Relay["connectionStatus"]>>([
  "connecting",
]);
const SUCCESS_STATUSES = new Set<NonNullable<Relay["connectionStatus"]>>([
  "connected",
  "read-only",
]);
const FAILED_STATUSES = new Set<NonNullable<Relay["connectionStatus"]>>([
  "disconnected",
  "connection-error",
  "verification-failed",
]);
const DEFAULT_RECONNECT_FAILURE_GRACE_MS = 1500;

function resolveRelayStatus(relay: Relay | undefined): NonNullable<Relay["connectionStatus"]> {
  if (!relay?.connectionStatus || relay.id === "demo") return "connected";
  return relay.connectionStatus;
}

function isFailedRelaySelectionTarget(relay: Relay): boolean {
  return shouldReconnectRelayOnSelection(relay.connectionStatus);
}

function shouldShowReconnectAttemptOnSelection(relay: Relay): boolean {
  return isFailedRelaySelectionTarget(relay) && relay.connectionStatus !== "read-only";
}

export function useRelaySelectionController({
  relays,
  reconnectFailureGraceMs = DEFAULT_RECONNECT_FAILURE_GRACE_MS,
}: UseRelaySelectionControllerOptions) {
  const pendingReconnectSelectionsRef = useRef<Map<string, PendingReconnectSelection>>(new Map());
  const relaysRef = useRef(relays);

  const {
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleToggleAllRelays,
  } = useRelayFilterState({
    relays,
    getEnableToastMessage: (relay) => {
      if (!shouldShowReconnectAttemptOnSelection(relay)) return undefined;
      return null;
    },
    onRelayEnabled: (relay) => {
      if (!shouldShowReconnectAttemptOnSelection(relay)) return;

      const relayDomain = getRelayDomain(relay, relay.id);
      const existing = pendingReconnectSelectionsRef.current.get(relay.id);
      if (existing) {
        window.clearTimeout(existing.timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        const latestRelay = relaysRef.current.find((entry) => entry.id === relay.id);
        const latestStatus = resolveRelayStatus(latestRelay);
        if (FAILED_STATUSES.has(latestStatus)) {
          setActiveRelayIds((previous) => {
            if (!previous.has(relay.id)) return previous;
            const next = new Set(previous);
            next.delete(relay.id);
            return next;
          });
          notifyRelayReconnectFailed(relayDomain);
          pendingReconnectSelectionsRef.current.delete(relay.id);
          return;
        }

        if (SUCCESS_STATUSES.has(latestStatus)) {
          pendingReconnectSelectionsRef.current.delete(relay.id);
        }
      }, reconnectFailureGraceMs);

      pendingReconnectSelectionsRef.current.set(relay.id, {
        relayId: relay.id,
        sawRecoveringState: false,
        timeoutId,
      });
      notifyRelayReconnectAttempt(relayDomain);
    },
  });

  relaysRef.current = relays;

  const clearPendingReconnectSelection = useCallback((relayId: string) => {
    const pendingSelection = pendingReconnectSelectionsRef.current.get(relayId);
    if (!pendingSelection) return;
    window.clearTimeout(pendingSelection.timeoutId);
    pendingReconnectSelectionsRef.current.delete(relayId);
  }, []);

  useEffect(() => {
    pendingReconnectSelectionsRef.current.forEach((pendingSelection, relayId) => {
      if (!activeRelayIds.has(relayId)) {
        clearPendingReconnectSelection(relayId);
        return;
      }

      const relay = relays.find((entry) => entry.id === relayId);
      if (!relay) {
        clearPendingReconnectSelection(relayId);
        return;
      }

      const relayStatus = resolveRelayStatus(relay);
      if (SUCCESS_STATUSES.has(relayStatus)) {
        clearPendingReconnectSelection(relayId);
        return;
      }

      if (RECOVERING_STATUSES.has(relayStatus)) {
        pendingReconnectSelectionsRef.current.set(relayId, {
          ...pendingSelection,
          sawRecoveringState: true,
        });
        return;
      }

      if (FAILED_STATUSES.has(relayStatus) && pendingSelection.sawRecoveringState) {
        const relayDomain = getRelayDomain(relay, relayId);
        setActiveRelayIds((previous) => {
          if (!previous.has(relayId)) return previous;
          const next = new Set(previous);
          next.delete(relayId);
          return next;
        });
        notifyRelayReconnectFailed(relayDomain);
        clearPendingReconnectSelection(relayId);
      }
    });
  }, [activeRelayIds, clearPendingReconnectSelection, relays, setActiveRelayIds]);

  useEffect(() => {
    const pendingReconnectSelections = pendingReconnectSelectionsRef.current;
    return () => {
      pendingReconnectSelections.forEach((pendingSelection) => {
        window.clearTimeout(pendingSelection.timeoutId);
      });
      pendingReconnectSelections.clear();
    };
  }, []);

  const handleRelaySelectIntent = useCallback((relayId: string, mode: RelaySelectionMode) => {
    const relay = relays.find((entry) => entry.id === relayId);
    const relayUrl = relay ? normalizeRelayUrl(relay.url) : null;
    const isCurrentlyActive = activeRelayIds.has(relayId);
    const willEnable = mode === "exclusive"
      ? !(activeRelayIds.size === 1 && isCurrentlyActive)
      : !isCurrentlyActive;
    const reconnectRelayUrl = willEnable && relay && isFailedRelaySelectionTarget(relay) && relayUrl
      ? relayUrl
      : null;

    if (mode === "exclusive") {
      handleRelayExclusive(relayId);
      return reconnectRelayUrl;
    }
    handleRelayToggle(relayId);
    return reconnectRelayUrl;
  }, [activeRelayIds, handleRelayExclusive, handleRelayToggle, relays]);

  return {
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleRelaySelectIntent,
    handleToggleAllRelays,
  };
}
