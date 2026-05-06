import { useCallback, useRef, type MutableRefObject } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { type NDKRelay } from "@nostr-dev-kit/ndk";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { mapRelayTransportStatus } from "./use-relay-pool";

const RELAY_CONNECTING_WATCHDOG_MS = 15000;

interface UseRelayTransportArgs {
  removedRelaysRef: MutableRefObject<Set<string>>;
  scheduleRelayTimeout: (callback: () => void, delayMs: number) => number;
  clearTrackedRelayTimeout: (timeoutId: number | undefined) => void;
}

export function useRelayTransport({
  removedRelaysRef,
  scheduleRelayTimeout,
  clearTrackedRelayTimeout,
}: UseRelayTransportArgs) {
  const relayCurrentInstanceRef = useRef<Map<string, NDKRelay>>(new Map());
  const relayConnectWatchdogIdsRef = useRef<Map<string, number>>(new Map());

  const clearRelayConnectWatchdog = useCallback((normalizedRelayUrl: string) => {
    const timeoutId = relayConnectWatchdogIdsRef.current.get(normalizedRelayUrl);
    if (typeof timeoutId !== "number") return;
    clearTrackedRelayTimeout(timeoutId);
    relayConnectWatchdogIdsRef.current.delete(normalizedRelayUrl);
  }, [clearTrackedRelayTimeout]);

  const clearAllRelayConnectWatchdogIds = useCallback(() => {
    relayConnectWatchdogIdsRef.current.clear();
  }, []);

  const disconnectTrackedRelayInstance = useCallback((ndkInstance: NDK, relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const trackedRelay = relayCurrentInstanceRef.current.get(normalizedRelayUrl);
    const pooledRelay = ndkInstance.pool.relays.get(normalizedRelayUrl);

    clearRelayConnectWatchdog(normalizedRelayUrl);
    relayCurrentInstanceRef.current.delete(normalizedRelayUrl);

    // Remove from pool before calling disconnect() so that any synchronous NDK event
    // handlers that fire inside disconnect() see an already-clean pool and cannot
    // re-schedule a reconnect for the same URL.
    ndkInstance.pool.removeRelay(normalizedRelayUrl);

    if (trackedRelay) {
      trackedRelay.disconnect();
    }
    if (pooledRelay && pooledRelay !== trackedRelay) {
      pooledRelay.disconnect();
    }
  }, [clearRelayConnectWatchdog]);

  const scheduleRelayConnectWatchdog = useCallback((_ndkInstance: NDK, relay: NDKRelay) => {
    const normalizedRelayUrl = normalizeRelayUrl(relay.url);
    clearRelayConnectWatchdog(normalizedRelayUrl);

    const timeoutId = scheduleRelayTimeout(() => {
      relayConnectWatchdogIdsRef.current.delete(normalizedRelayUrl);
      if (
        relayCurrentInstanceRef.current.get(normalizedRelayUrl) !== relay ||
        removedRelaysRef.current.has(normalizedRelayUrl)
      ) {
        return;
      }

      const mappedStatus = mapRelayTransportStatus(relay);
      if (mappedStatus !== "connecting") return;

      nostrDevLog("relay", "Relay connection attempt timed out before opening; closing socket", {
        relayUrl: normalizedRelayUrl,
      });
      // Close the dead socket; onRelayDisconnect's initial-failure path then schedules retry.
      relay.disconnect();
    }, RELAY_CONNECTING_WATCHDOG_MS);

    relayConnectWatchdogIdsRef.current.set(normalizedRelayUrl, timeoutId);
  }, [
    clearRelayConnectWatchdog,
    removedRelaysRef,
    scheduleRelayTimeout,
  ]);

  const connectManagedRelay = useCallback((
    ndkInstance: NDK,
    relayUrl: string,
    options?: { forceNewSocket?: boolean }
  ): NDKRelay => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const forceNewSocket = options?.forceNewSocket ?? false;
    const trackedRelay =
      relayCurrentInstanceRef.current.get(normalizedRelayUrl) ??
      ndkInstance.pool.relays.get(normalizedRelayUrl);

    if (trackedRelay && !forceNewSocket) {
      const mappedStatus = mapRelayTransportStatus(trackedRelay);
      if (mappedStatus === "connected" || mappedStatus === "connecting") {
        relayCurrentInstanceRef.current.set(normalizedRelayUrl, trackedRelay);
        if (mappedStatus === "connected") {
          clearRelayConnectWatchdog(normalizedRelayUrl);
        } else {
          scheduleRelayConnectWatchdog(ndkInstance, trackedRelay);
        }
        return trackedRelay;
      }
      // Stale/disconnected: fall through to rebuild. Calling .connect() on the
      // existing NDKRelay races NDK's own handleReconnection — both reassign
      // connectivity.ws without closing the previous socket, leaving an orphan
      // WebSocket alive while traffic flows on the new one.
    }

    if (trackedRelay) {
      disconnectTrackedRelayInstance(ndkInstance, normalizedRelayUrl);
    }

    const relay = ndkInstance.pool.getRelay(normalizedRelayUrl, false);
    relayCurrentInstanceRef.current.set(normalizedRelayUrl, relay);
    scheduleRelayConnectWatchdog(ndkInstance, relay);
    relay.connect();
    return relay;
  }, [clearRelayConnectWatchdog, disconnectTrackedRelayInstance, scheduleRelayConnectWatchdog]);

  return {
    relayCurrentInstanceRef,
    connectManagedRelay,
    disconnectTrackedRelayInstance,
    scheduleRelayConnectWatchdog,
    clearRelayConnectWatchdog,
    clearAllRelayConnectWatchdogIds,
  };
}
