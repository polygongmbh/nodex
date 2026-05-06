import { useCallback, type MutableRefObject } from "react";
import NDK, {
  type NDKEvent,
  type NDKFilter,
  type NDKRelay,
  type NDKSubscription,
} from "@nostr-dev-kit/ndk";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { applyPerformanceAwareSubscriptionLimits } from "./subscription-limits";
import {
  isAuthRequiredCloseReason,
  shouldRetryAuthClosedSubscription,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import type { AuthMethod, NDKRelayStatus } from "./contracts";

interface UseSubscribeArgs {
  ndk: NDK | null;
  relaysRef: MutableRefObject<NDKRelayStatus[]>;
  authMethodRef: MutableRefObject<AuthMethod>;
  pendingRelayVerificationRef: MutableRefObject<Map<string, { operation: "read" | "write"; requestedAt: number }>>;
  relayAuthRetryHistoryRef: MutableRefObject<Map<string, number>>;
  relaysPendingAuthSubscriptionReplayRef: MutableRefObject<Set<string>>;
  beginRelayOperation: (op: "read" | "write") => void;
  endRelayOperation: (op: "read" | "write") => void;
  markRelayVerificationFailure: (
    relayUrl: string,
    operation: "read" | "write",
    options: { setStatus: boolean; showToast: boolean }
  ) => void;
  updateRelayCapabilityStatus: (relayUrl: string, status: "connected") => void;
  primeRelayAuthChallenge: (ndkInstance: NDK, relayUrl: string) => void;
  connectManagedRelay: (ndkInstance: NDK, relayUrl: string, options?: { forceNewSocket?: boolean }) => NDKRelay;
}

export function useSubscribe({
  ndk,
  relaysRef,
  authMethodRef,
  pendingRelayVerificationRef,
  relayAuthRetryHistoryRef,
  relaysPendingAuthSubscriptionReplayRef,
  beginRelayOperation,
  endRelayOperation,
  markRelayVerificationFailure,
  updateRelayCapabilityStatus,
  primeRelayAuthChallenge,
  connectManagedRelay,
}: UseSubscribeArgs) {
  const subscribe = useCallback((
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ): NDKSubscription | null => {
    if (!ndk) return null;
    const authScope = authMethodRef.current || "signed-out";
    const activeRelays = relaysRef.current;

    const limitDecision = applyPerformanceAwareSubscriptionLimits(filters, typeof navigator === "undefined"
      ? undefined
      : {
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: "deviceMemory" in navigator ? (navigator as Record<string, unknown>).deviceMemory as number : undefined,
      });

    nostrDevLog("subscribe", "Creating subscription", {
      filterCount: limitDecision.filters.length,
      filters: limitDecision.filters,
      performanceClass: limitDecision.performanceClass,
      subscriptionLimitCap: limitDecision.cap,
      appliedPerformanceCap: limitDecision.changed,
      authScope,
    });

    if (ndk.signer) {
      activeRelays
        .filter((relay) => relay.nip11?.authRequired)
        .map((relay) => normalizeRelayUrl(relay.url))
        .forEach((relayUrl) => {
          primeRelayAuthChallenge(ndk, relayUrl);
        });
    }

    beginRelayOperation("read");
    const subscription = ndk.subscribe(limitDecision.filters, { closeOnEose: options?.closeOnEose ?? false });

    subscription.on("event", (event: NDKEvent) => {
      if (event.relay?.url) {
        updateRelayCapabilityStatus(event.relay.url, "connected");
      }
      onEvent(event);
    });
    subscription.on("closed", (relay: NDKRelay, reason: string) => {
      if (!isAuthRequiredCloseReason(reason || "")) return;
      nostrDevLog("relay", "Relay closed subscription due to auth failure", {
        relayUrl: relay.url,
        reason,
      });
      const normalizedRelayUrl = relay.url.replace(/\/+$/, "");
      const relayFilters = subscription.relayFilters?.get(normalizedRelayUrl) ?? limitDecision.filters;
      const shouldRetry = shouldRetryAuthClosedSubscription({
        hasSigner: Boolean(ndk.signer),
        hadPendingAuthChallenge: pendingRelayVerificationRef.current.has(normalizedRelayUrl),
        lastRetryAt: relayAuthRetryHistoryRef.current.get(normalizedRelayUrl),
        now: Date.now(),
        reason: reason || "",
        filters: relayFilters,
      });
      if (shouldRetry) {
        relayAuthRetryHistoryRef.current.set(normalizedRelayUrl, Date.now());
        nostrDevLog("relay", "Retrying auth-closed relay subscription without forcing a new socket", {
          relayUrl: normalizedRelayUrl,
        });
        const managedRelay = connectManagedRelay(ndk, normalizedRelayUrl);
        managedRelay.subscribe(subscription, relayFilters);
      } else {
        relaysPendingAuthSubscriptionReplayRef.current.add(normalizedRelayUrl);
        nostrDevLog("relay", "Skipping auth-closed relay subscription retry", {
          relayUrl: normalizedRelayUrl,
          reason,
        });
      }
      markRelayVerificationFailure(relay.url, "read", {
        setStatus: !shouldRetry && shouldSetVerificationFailedStatus("subscription-closed", "read"),
        showToast: !shouldRetry,
      });
    });
    let finished = false;
    const finishRead = () => {
      if (finished) return;
      finished = true;
      endRelayOperation("read");
    };
    subscription.on("eose", finishRead);
    subscription.on("close", finishRead);

    return subscription;
  }, [authMethodRef, beginRelayOperation, connectManagedRelay, endRelayOperation, markRelayVerificationFailure, ndk, pendingRelayVerificationRef, primeRelayAuthChallenge, relayAuthRetryHistoryRef, relaysPendingAuthSubscriptionReplayRef, relaysRef, updateRelayCapabilityStatus]);

  return { subscribe };
}
