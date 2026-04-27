import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKRelay } from "@nostr-dev-kit/ndk";
import {
  inferMappedStatusFromUiStatus,
  mapNativeRelayStatus,
  resolveRelayStatus,
} from "./relay-status";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import type { NDKRelayStatus } from "./contracts";

export interface RelayTransportRefs {
  removedRelaysRef: MutableRefObject<Set<string>>;
  relayInitialFailureCountsRef: MutableRefObject<Map<string, number>>;
  relayConnectedOnceRef: MutableRefObject<Set<string>>;
  relayVerificationReadOpsRef: MutableRefObject<number>;
  relayVerificationWriteOpsRef: MutableRefObject<number>;
  relayAttemptStartedAtRef: MutableRefObject<Map<string, number>>;
  relayCurrentInstanceRef: MutableRefObject<Map<string, NDKRelay>>;
  relayReadRejectedRef: MutableRefObject<Map<string, boolean>>;
  relayWriteRejectedRef: MutableRefObject<Map<string, boolean>>;
  pendingRelayVerificationRef: MutableRefObject<Map<string, { operation: RelayOperation; requestedAt: number }>>;
  relayAuthRetryHistoryRef: MutableRefObject<Map<string, number>>;
}

export type RelayOperation = "read" | "write" | "unknown";

export interface RelayTransportCallbacks {
  resetRelayTransportTracking: (normalizedRelayUrl: string) => void;
  clearRelayCapabilityTracking: (normalizedRelayUrl: string) => void;
  getRelayTransportStatus: (normalizedRelayUrl: string, previousStatus?: NDKRelayStatus["status"]) => NDKRelayStatus["status"];
  resolveRelayUiStatus: (normalizedRelayUrl: string, options?: { mappedStatus?: NDKRelayStatus["status"]; previousStatus?: NDKRelayStatus["status"]; now?: number }) => NDKRelayStatus["status"];
  updateRelayStatus: (normalizedRelayUrl: string, options?: { mappedStatus?: NDKRelayStatus["status"]; now?: number; ensureEntry?: boolean }) => void;
  isCurrentRelayInstance: (relay: NDKRelay) => boolean;
  connectRelay: (relayUrl: string, options?: { forceNewSocket?: boolean; clearCapabilityState?: boolean }) => NDKRelay | null;
}

export function useRelayTransport(
  refs: RelayTransportRefs,
  ndkRef: MutableRefObject<NDK | null>,
  setRelays: React.Dispatch<React.SetStateAction<NDKRelayStatus[]>>,
  relayInfoRef: MutableRefObject<Map<string, import("../relay-info").RelayInfoSummary>>,
): RelayTransportCallbacks {
  const {
    removedRelaysRef,
    relayInitialFailureCountsRef,
    relayConnectedOnceRef,
    relayAttemptStartedAtRef,
    relayCurrentInstanceRef,
    relayReadRejectedRef,
    relayWriteRejectedRef,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
  } = refs;

  const resetRelayTransportTracking = useCallback((normalizedRelayUrl: string) => {
    removedRelaysRef.current.delete(normalizedRelayUrl);
    relayInitialFailureCountsRef.current.delete(normalizedRelayUrl);
    relayConnectedOnceRef.current.delete(normalizedRelayUrl);
    pendingRelayVerificationRef.current.delete(normalizedRelayUrl);
    relayAuthRetryHistoryRef.current.delete(normalizedRelayUrl);
    relayAttemptStartedAtRef.current.set(normalizedRelayUrl, Date.now());
    relayReadRejectedRef.current.delete(normalizedRelayUrl);
    relayWriteRejectedRef.current.delete(normalizedRelayUrl);
  }, [
    removedRelaysRef,
    relayInitialFailureCountsRef,
    relayConnectedOnceRef,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
    relayAttemptStartedAtRef,
    relayReadRejectedRef,
    relayWriteRejectedRef,
  ]);

  const clearRelayCapabilityTracking = useCallback((normalizedRelayUrl: string) => {
    relayReadRejectedRef.current.delete(normalizedRelayUrl);
    relayWriteRejectedRef.current.delete(normalizedRelayUrl);
  }, [relayReadRejectedRef, relayWriteRejectedRef]);

  const getRelayTransportStatus = useCallback((
    normalizedRelayUrl: string,
    previousStatus?: NDKRelayStatus["status"]
  ): NDKRelayStatus["status"] => {
    const relay = relayCurrentInstanceRef.current.get(normalizedRelayUrl);
    if (relay) {
      return mapNativeRelayStatus(relay.status);
    }
    return inferMappedStatusFromUiStatus(previousStatus);
  }, [relayCurrentInstanceRef]);

  const resolveRelayUiStatus = useCallback((
    normalizedRelayUrl: string,
    options?: {
      mappedStatus?: NDKRelayStatus["status"];
      previousStatus?: NDKRelayStatus["status"];
      now?: number;
    }
  ): NDKRelayStatus["status"] => {
    return resolveRelayStatus({
      mappedStatus: options?.mappedStatus ?? getRelayTransportStatus(normalizedRelayUrl, options?.previousStatus),
      previousStatus: options?.previousStatus,
      hasConnectedOnce: relayConnectedOnceRef.current.has(normalizedRelayUrl),
      attemptStartedAt: relayAttemptStartedAtRef.current.get(normalizedRelayUrl),
      now: options?.now ?? Date.now(),
      readRejected: relayReadRejectedRef.current.get(normalizedRelayUrl) === true,
      writeRejected: relayWriteRejectedRef.current.get(normalizedRelayUrl) === true,
    });
  }, [
    getRelayTransportStatus,
    relayConnectedOnceRef,
    relayAttemptStartedAtRef,
    relayReadRejectedRef,
    relayWriteRejectedRef,
  ]);

  const updateRelayStatus = useCallback((
    normalizedRelayUrl: string,
    options?: {
      mappedStatus?: NDKRelayStatus["status"];
      now?: number;
      ensureEntry?: boolean;
    }
  ) => {
    setRelays((previous) => {
      let found = false;
      const next = previous.map((relay) => {
        if (normalizeRelayUrl(relay.url) !== normalizedRelayUrl) return relay;
        found = true;
        return {
          ...relay,
          url: normalizedRelayUrl,
          status: resolveRelayUiStatus(normalizedRelayUrl, {
            mappedStatus: options?.mappedStatus,
            previousStatus: relay.status,
            now: options?.now,
          }),
        };
      });

      if (found || !options?.ensureEntry) return next;

      const info = relayInfoRef.current.get(normalizedRelayUrl);
      return [...next, {
        url: normalizedRelayUrl,
        status: resolveRelayUiStatus(normalizedRelayUrl, {
          mappedStatus: options?.mappedStatus,
          now: options?.now,
        }),
        nip11: info
          ? {
              authRequired: info.authRequired,
              supportsNip42: info.supportsNip42,
              checkedAt: Date.now(),
            }
          : undefined,
      }];
    });
  }, [resolveRelayUiStatus, setRelays, relayInfoRef]);

  const isCurrentRelayInstance = useCallback((relay: NDKRelay): boolean => {
    const normalized = normalizeRelayUrl(relay.url);
    const currentRelay = relayCurrentInstanceRef.current.get(normalized);
    return currentRelay === relay;
  }, [relayCurrentInstanceRef]);

  const connectRelay = useCallback((
    relayUrl: string,
    options?: { forceNewSocket?: boolean; clearCapabilityState?: boolean }
  ): NDKRelay | null => {
    const ndk = ndkRef.current;
    if (!ndk) return null;
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const existingRelay =
      relayCurrentInstanceRef.current.get(normalizedRelayUrl) ??
      ndk.pool.getRelay(normalizedRelayUrl, false);
    const transportStatus = existingRelay ? mapNativeRelayStatus(existingRelay.status) : undefined;
    const forceNewSocket = options?.forceNewSocket ?? false;

    if (existingRelay && !forceNewSocket && (transportStatus === "connected" || transportStatus === "connecting")) {
      relayCurrentInstanceRef.current.set(normalizedRelayUrl, existingRelay);
      updateRelayStatus(normalizedRelayUrl, {
        mappedStatus: transportStatus,
        ensureEntry: true,
      });
      return existingRelay;
    }

    resetRelayTransportTracking(normalizedRelayUrl);
    if (options?.clearCapabilityState) {
      clearRelayCapabilityTracking(normalizedRelayUrl);
    }
    updateRelayStatus(normalizedRelayUrl, {
      mappedStatus: "connecting",
      ensureEntry: true,
    });

    if (existingRelay && forceNewSocket) {
      ndk.pool.removeRelay(normalizedRelayUrl);
    }

    const relay = ndk.pool.getRelay(normalizedRelayUrl, false);
    relayCurrentInstanceRef.current.set(normalizedRelayUrl, relay);
    relay.connect();
    return relay;
  }, [
    ndkRef,
    relayCurrentInstanceRef,
    resetRelayTransportTracking,
    clearRelayCapabilityTracking,
    updateRelayStatus,
  ]);

  return {
    resetRelayTransportTracking,
    clearRelayCapabilityTracking,
    getRelayTransportStatus,
    resolveRelayUiStatus,
    updateRelayStatus,
    isCurrentRelayInstance,
    connectRelay,
  };
}
