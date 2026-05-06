import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type NDK from "@nostr-dev-kit/ndk";
import { type NDKRelay } from "@nostr-dev-kit/ndk";
import type { NDKRelayStatus } from "./contracts";
import { mapNativeRelayStatus, mapRelayStatuses, mergeRelayStatusUpdates } from "./relay-status";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { RelayInfoSummary } from "@/infrastructure/nostr/relay-info";

export function mapRelayTransportStatus(relay: NDKRelay): NDKRelayStatus["status"] {
  return mapNativeRelayStatus(relay.status);
}

export function resolveConnectedRelayStatus(status?: NDKRelayStatus["status"]): NDKRelayStatus["status"] {
  if (status === "verification-failed") return "verification-failed";
  if (status === "read-only") return "read-only";
  return "connected";
}

export interface UseRelayPoolDeps {
  scheduleRelayConnectWatchdog: (ndkInstance: NDK, relay: NDKRelay) => void;
  clearRelayConnectWatchdog: (normalizedRelayUrl: string) => void;
  attachRelayOkRejectObserver: (relay: NDKRelay) => void;
  detachRelayOkRejectObserver: (relayUrl: string) => void;
  primeRelayAuthChallenge: (ndkInstance: NDK, relayUrl: string) => void;
  markRelayVerificationSuccess: (relayUrl: string, operation: "read" | "write" | "unknown") => void;
  updateRelayCapabilityStatus: (
    relayUrl: string,
    nextStatus: "connected" | "read-only" | "verification-failed"
  ) => void;
  replayActiveSubscriptionsForRelay: (ndkInstance: NDK, relayUrl: string) => void;
  scheduleRelayTimeout: (callback: () => void, delayMs: number) => number;
  resolveRelayConnectRetryDelay: (failureCount: number) => number;
  relayCurrentInstanceRef: MutableRefObject<Map<string, NDKRelay>>;
  relayInfoRef: MutableRefObject<Map<string, RelayInfoSummary>>;
  relayInfoFetchedAtRef: MutableRefObject<Map<string, number>>;
  relayInitialFailureCountsRef: MutableRefObject<Map<string, number>>;
  relayConnectedOnceRef: MutableRefObject<Set<string>>;
  pendingRelayVerificationRef: MutableRefObject<Map<string, { operation: "read" | "write" | "unknown"; requestedAt: number }>>;
  relaysPendingAuthSubscriptionReplayRef: MutableRefObject<Set<string>>;
}

export function useRelayPool(depsRef: MutableRefObject<UseRelayPoolDeps>) {
  const [relays, setRelays] = useState<NDKRelayStatus[]>([]);
  const relaysRef = useRef<NDKRelayStatus[]>([]);
  relaysRef.current = relays;
  const removedRelaysRef = useRef<Set<string>>(new Set());

  const updateRelayEntry = useCallback((
    normalizedRelayUrl: string,
    transform: (relay: NDKRelayStatus) => NDKRelayStatus
  ) => {
    setRelays((previous) =>
      mapRelayStatuses(previous, (relay) => (
        relay.url.replace(/\/+$/, "") === normalizedRelayUrl
          ? transform(relay)
          : relay
      ))
    );
  }, []);

  const attachPoolHandlers = useCallback((ndkInstance: NDK): (() => void) => {
    const syncRelayStatusesFromPool = () => {
      const { relayCurrentInstanceRef } = depsRef.current;
      setRelays((prev) => {
        const previousEntryByUrl = new Map(
          prev.map((entry) => [normalizeRelayUrl(entry.url), entry] as const)
        );
        const updates: typeof prev = [];
        ndkInstance.pool.relays.forEach((relay: NDKRelay) => {
          const normalized = normalizeRelayUrl(relay.url);
          const currentRelay = relayCurrentInstanceRef.current.get(normalized);
          if (currentRelay && currentRelay !== relay) return;
          relayCurrentInstanceRef.current.set(normalized, relay);
          if (removedRelaysRef.current.has(normalized)) return;
          const previousEntry = previousEntryByUrl.get(normalized);
          const mappedStatus = mapRelayTransportStatus(relay);
          updates.push({
            ...previousEntry,
            url: normalized,
            status: mappedStatus === "connected"
              ? resolveConnectedRelayStatus(previousEntry?.status)
              : mappedStatus,
          });
        });
        return mergeRelayStatusUpdates(prev, updates);
      });
    };

    const onRelayConnecting = (relay: NDKRelay) => {
      const { relayCurrentInstanceRef, scheduleRelayConnectWatchdog } = depsRef.current;
      const normalized = normalizeRelayUrl(relay.url);
      const currentRelay = relayCurrentInstanceRef.current.get(normalized);
      if (!currentRelay || currentRelay === relay) {
        relayCurrentInstanceRef.current.set(normalized, relay);
        scheduleRelayConnectWatchdog(ndkInstance, relay);
      }
      syncRelayStatusesFromPool();
    };

    const onRelayConnect = (relay: NDKRelay) => {
      const {
        relayCurrentInstanceRef,
        clearRelayConnectWatchdog,
        attachRelayOkRejectObserver,
        relayConnectedOnceRef,
        relayInitialFailureCountsRef,
        relayInfoRef,
        relayInfoFetchedAtRef,
        primeRelayAuthChallenge,
        pendingRelayVerificationRef,
        markRelayVerificationSuccess,
      } = depsRef.current;
      const normalized = normalizeRelayUrl(relay.url);
      const currentRelay = relayCurrentInstanceRef.current.get(normalized);
      if (currentRelay && currentRelay !== relay) {
        return;
      }
      relayCurrentInstanceRef.current.set(normalized, relay);
      clearRelayConnectWatchdog(normalized);
      attachRelayOkRejectObserver(relay);
      nostrDevLog("relay", "Relay connected", { relayUrl: normalized });
      relayConnectedOnceRef.current.add(normalized);
      relayInitialFailureCountsRef.current.delete(normalized);
      const relayInfo = relayInfoRef.current.get(normalized);
      if (relayInfo?.authRequired) {
        primeRelayAuthChallenge(ndkInstance, normalized);
      }
      const pendingVerification = pendingRelayVerificationRef.current.get(normalized);
      if (pendingVerification) {
        pendingRelayVerificationRef.current.delete(normalized);
        markRelayVerificationSuccess(normalized, pendingVerification.operation);
      }
      if (removedRelaysRef.current.has(normalized)) return;
      setRelays((prev) => {
        const existing = prev.find((r) => normalizeRelayUrl(r.url) === normalized);
        const newStatus = resolveConnectedRelayStatus(existing?.status);
        if (existing) {
          if (existing.status === newStatus) return prev;
          return prev.map((r) =>
            normalizeRelayUrl(r.url) === normalized
              ? { ...r, url: normalized, status: newStatus }
              : r
          );
        }
        const info = relayInfoRef.current.get(normalized);
        const checkedAt = relayInfoFetchedAtRef.current.get(normalized);
        return [...prev, {
          url: normalized,
          status: newStatus,
          nip11: info
            ? {
                authRequired: info.authRequired,
                supportsNip42: info.supportsNip42,
                checkedAt: checkedAt ?? Date.now(),
              }
            : undefined,
        }];
      });
    };

    const onRelayAuthed = (relay: NDKRelay) => {
      const {
        relayCurrentInstanceRef,
        pendingRelayVerificationRef,
        markRelayVerificationSuccess,
        updateRelayCapabilityStatus,
        relaysPendingAuthSubscriptionReplayRef,
        replayActiveSubscriptionsForRelay,
      } = depsRef.current;
      const normalized = normalizeRelayUrl(relay.url);
      const currentRelay = relayCurrentInstanceRef.current.get(normalized);
      if (currentRelay && currentRelay !== relay) {
        return;
      }
      const pendingVerification = pendingRelayVerificationRef.current.get(normalized);
      if (pendingVerification) {
        pendingRelayVerificationRef.current.delete(normalized);
        markRelayVerificationSuccess(normalized, pendingVerification.operation);
        nostrDevLog("relay", "Relay authentication completed for pending verification challenge", {
          relayUrl: normalized,
          operation: pendingVerification.operation,
        });
      } else {
        // Auth succeeded without a tracked pending challenge (e.g. relay sent the auth
        // challenge before our preflight probe or after a reconnect). Clear read rejection
        // directly since relay:authed is the definitive success signal.
        updateRelayCapabilityStatus(normalized, "connected");
        nostrDevLog("relay", "Relay authentication completed without pending verification challenge", {
          relayUrl: normalized,
        });
      }
      const shouldReplaySubscriptions = relaysPendingAuthSubscriptionReplayRef.current.delete(normalized);
      if (shouldReplaySubscriptions) {
        replayActiveSubscriptionsForRelay(ndkInstance, normalized);
      }
    };

    const onRelayDisconnect = (relay: NDKRelay) => {
      const {
        clearRelayConnectWatchdog,
        detachRelayOkRejectObserver,
        relayCurrentInstanceRef,
        relayConnectedOnceRef,
        relayInitialFailureCountsRef,
        scheduleRelayTimeout,
        resolveRelayConnectRetryDelay,
      } = depsRef.current;
      const normalized = normalizeRelayUrl(relay.url);
      nostrDevLog("relay", "Relay disconnected", { relayUrl: normalized });
      clearRelayConnectWatchdog(normalized);
      detachRelayOkRejectObserver(normalized);
      const currentRelay = relayCurrentInstanceRef.current.get(normalized);
      if (currentRelay && currentRelay !== relay) {
        return;
      }
      const activeRelay = ndkInstance.pool.relays.get(normalized);
      if (!currentRelay && !activeRelay) {
        return;
      }

      // Ignore late disconnects from a removed relay instance after the same normalized URL
      // has already been re-added to the pool.
      if (activeRelay && activeRelay !== relay) {
        return;
      }

      if (!removedRelaysRef.current.has(normalized)) {
        setRelays((prev) => {
          const existing = prev.find((r) => normalizeRelayUrl(r.url) === normalized);
          if (!existing || existing.status === "disconnected") return prev;
          return prev.map((r) =>
            normalizeRelayUrl(r.url) === normalized ? { ...r, status: "disconnected" } : r
          );
        });
      }

      if (relayConnectedOnceRef.current.has(normalized)) {
        // Relay had connected before. NDK normally handles reconnection via handleReconnection(),
        // but NDK's handleStaleConnection() (wsStateMonitor / keepalive probe) sets status to
        // DISCONNECTED *before* calling onDisconnect(), so handleReconnection is never scheduled.
        // Scheduling relay.connect() here covers that gap; NDK's internal guard makes it a no-op
        // if NDK is already reconnecting.
        if (!removedRelaysRef.current.has(normalized)) {
          scheduleRelayTimeout(() => {
            if (
              relayCurrentInstanceRef.current.get(normalized) === relay &&
              !removedRelaysRef.current.has(normalized)
            ) {
              relay.connect();
            }
          }, 3000);
        }
        return;
      }

      // Relay has never connected. NDK skips handleReconnection() when the initial WebSocket
      // closes while still in CONNECTING state (because status wasn't CONNECTED). Track failures
      // and schedule retries with exponential backoff ourselves.
      const nextFailureCount = (relayInitialFailureCountsRef.current.get(normalized) ?? 0) + 1;
      relayInitialFailureCountsRef.current.set(normalized, nextFailureCount);

      if (!removedRelaysRef.current.has(normalized)) {
        const delay = resolveRelayConnectRetryDelay(nextFailureCount);
        scheduleRelayTimeout(() => {
          if (
            relayCurrentInstanceRef.current.get(normalized) === relay &&
            !removedRelaysRef.current.has(normalized)
          ) {
            relay.connect();
          }
        }, delay);
      }
    };

    ndkInstance.pool.on("relay:connecting", onRelayConnecting);
    ndkInstance.pool.on("relay:connect", onRelayConnect);
    ndkInstance.pool.on("relay:authed", onRelayAuthed);
    ndkInstance.pool.on("relay:disconnect", onRelayDisconnect);

    return () => {
      ndkInstance.pool.off("relay:connecting", onRelayConnecting);
      ndkInstance.pool.off("relay:connect", onRelayConnect);
      ndkInstance.pool.off("relay:authed", onRelayAuthed);
      ndkInstance.pool.off("relay:disconnect", onRelayDisconnect);
    };
    // depsRef is a stable ref-of-deps; handlers read .current at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetRejectedRelayStatuses = useCallback(() => {
    setRelays((previous) =>
      previous.map((relay) =>
        relay.status === "verification-failed" || relay.status === "read-only"
          ? { ...relay, status: "connected" }
          : relay
      )
    );
  }, []);

  return {
    relays,
    setRelays,
    relaysRef,
    removedRelaysRef,
    updateRelayEntry,
    attachPoolHandlers,
    resetRejectedRelayStatuses,
  };
}
