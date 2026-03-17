import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { normalizeRelayUrl } from "./relay-list";
import { shouldSetVerificationFailedStatus } from "./relay-verification";
import { fetchRelayInfo, type RelayInfoSummary } from "@/infrastructure/nostr/relay-info";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import type { NDKRelayStatus } from "./contracts";
import type { RelayVerificationEvent } from "@/infrastructure/nostr/nip42-relay-auth-policy";
import type { RelayOperation } from "./use-relay-transport";
import type { RelayTransportCallbacks } from "./use-relay-transport";
import i18n from "@/lib/i18n/config";
import { toast } from "sonner";
import { shouldReconnectRelayAfterSignIn } from "./relay-verification";
import type { RelayTransportRefs } from "./use-relay-transport";

const RELAY_VERIFICATION_TOAST_DEDUPE_MS = 15000;

export interface RelayVerificationRefs {
  relayVerificationToastHistoryRef: MutableRefObject<Map<string, number>>;
  pendingRelayVerificationRef: MutableRefObject<Map<string, { operation: RelayOperation; requestedAt: number }>>;
  relayInfoRef: MutableRefObject<Map<string, RelayInfoSummary>>;
  relayVerificationReadOpsRef: MutableRefObject<number>;
  relayVerificationWriteOpsRef: MutableRefObject<number>;
}

export interface RelayVerificationCallbacks {
  beginRelayOperation: (operation: Exclude<RelayOperation, "unknown">) => void;
  endRelayOperation: (operation: Exclude<RelayOperation, "unknown">) => void;
  resolveRelayVerificationOperation: () => RelayOperation;
  markRelayReadOutcome: (relayUrl: string, allowed: boolean) => void;
  markRelayWriteOutcome: (relayUrl: string, allowed: boolean) => void;
  shouldShowRelayVerificationToast: (relayUrl: string, operation: RelayOperation, outcome: RelayVerificationEvent["outcome"] | "verified") => boolean;
  markRelayVerificationSuccess: (relayUrl: string, operation: RelayOperation) => void;
  markRelayVerificationFailure: (relayUrl: string, operation: RelayOperation, options?: { setStatus?: boolean; showToast?: boolean }) => void;
  notifyRelayVerificationEvent: (incoming: RelayVerificationEvent) => void;
  probeRelayInfo: (relayUrl: string) => Promise<void>;
  retryNip42RelaysAfterSignIn: (relayUrlsOverride?: string[]) => void;
}

export function useRelayVerification(
  refs: RelayVerificationRefs & Pick<RelayTransportRefs, "relayReadRejectedRef" | "relayWriteRejectedRef">,
  transport: RelayTransportCallbacks,
  setRelays: React.Dispatch<React.SetStateAction<NDKRelayStatus[]>>,
  relays: NDKRelayStatus[],
): RelayVerificationCallbacks {
  const {
    relayVerificationToastHistoryRef,
    pendingRelayVerificationRef,
    relayInfoRef,
    relayVerificationReadOpsRef,
    relayVerificationWriteOpsRef,
    relayReadRejectedRef,
    relayWriteRejectedRef,
  } = refs;
  const { updateRelayStatus, connectRelay } = transport;

  const resolveRelayVerificationOperation = useCallback((): RelayOperation => {
    const hasRead = relayVerificationReadOpsRef.current > 0;
    const hasWrite = relayVerificationWriteOpsRef.current > 0;
    if (hasRead && hasWrite) return "unknown";
    if (hasWrite) return "write";
    if (hasRead) return "read";
    return "unknown";
  }, [relayVerificationReadOpsRef, relayVerificationWriteOpsRef]);

  const beginRelayOperation = useCallback((operation: Exclude<RelayOperation, "unknown">) => {
    if (operation === "read") {
      relayVerificationReadOpsRef.current += 1;
      return;
    }
    relayVerificationWriteOpsRef.current += 1;
  }, [relayVerificationReadOpsRef, relayVerificationWriteOpsRef]);

  const endRelayOperation = useCallback((operation: Exclude<RelayOperation, "unknown">) => {
    if (operation === "read") {
      relayVerificationReadOpsRef.current = Math.max(0, relayVerificationReadOpsRef.current - 1);
      return;
    }
    relayVerificationWriteOpsRef.current = Math.max(0, relayVerificationWriteOpsRef.current - 1);
  }, [relayVerificationReadOpsRef, relayVerificationWriteOpsRef]);

  const markRelayReadOutcome = useCallback((relayUrl: string, allowed: boolean) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (allowed) {
      relayReadRejectedRef.current.delete(normalizedRelayUrl);
    } else {
      relayReadRejectedRef.current.set(normalizedRelayUrl, true);
    }
    updateRelayStatus(normalizedRelayUrl, { ensureEntry: true });
  }, [relayReadRejectedRef, updateRelayStatus]);

  const markRelayWriteOutcome = useCallback((relayUrl: string, allowed: boolean) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    if (allowed) {
      relayWriteRejectedRef.current.delete(normalizedRelayUrl);
    } else {
      relayWriteRejectedRef.current.set(normalizedRelayUrl, true);
    }
    updateRelayStatus(normalizedRelayUrl, { ensureEntry: true });
  }, [relayWriteRejectedRef, updateRelayStatus]);

  const shouldShowRelayVerificationToast = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    outcome: RelayVerificationEvent["outcome"] | "verified"
  ): boolean => {
    const now = Date.now();
    const key = `${relayUrl}|${operation}|${outcome}`;
    const previousShownAt = relayVerificationToastHistoryRef.current.get(key) ?? 0;
    if (now - previousShownAt < RELAY_VERIFICATION_TOAST_DEDUPE_MS) {
      return false;
    }
    relayVerificationToastHistoryRef.current.set(key, now);
    return true;
  }, [relayVerificationToastHistoryRef]);

  const markRelayVerificationSuccess = useCallback((relayUrl: string, operation: RelayOperation) => {
    if (operation === "read") {
      markRelayReadOutcome(relayUrl, true);
    } else if (operation === "write") {
      markRelayWriteOutcome(relayUrl, true);
    } else {
      markRelayReadOutcome(relayUrl, true);
      markRelayWriteOutcome(relayUrl, true);
    }
    if (!shouldShowRelayVerificationToast(relayUrl, operation, "verified")) {
      return;
    }
    if (operation === "read") {
      toast.success(i18n.t("toasts.success.relayVerificationRead", { relayUrl }));
      return;
    }
    if (operation === "write") {
      toast.success(i18n.t("toasts.success.relayVerificationWrite", { relayUrl }));
      return;
    }
    toast.success(i18n.t("toasts.success.relayVerificationUnknown", { relayUrl }));
  }, [markRelayReadOutcome, markRelayWriteOutcome, shouldShowRelayVerificationToast]);

  const markRelayVerificationFailure = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    options?: { setStatus?: boolean; showToast?: boolean }
  ) => {
    const shouldSetStatus = options?.setStatus ?? false;
    const shouldShowToast = options?.showToast ?? true;
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    pendingRelayVerificationRef.current.delete(normalizedRelayUrl);
    if (shouldSetStatus) {
      if (operation === "read") {
        markRelayReadOutcome(relayUrl, false);
      } else if (operation === "write") {
        markRelayWriteOutcome(relayUrl, false);
      } else {
        markRelayReadOutcome(relayUrl, false);
        markRelayWriteOutcome(relayUrl, false);
      }
    }
    if (!shouldShowToast || !shouldShowRelayVerificationToast(relayUrl, operation, "failed")) {
      return;
    }
    if (operation === "read") {
      toast.error(i18n.t("toasts.errors.relayVerificationReadFailed", { relayUrl }));
    } else if (operation === "write") {
      toast.error(i18n.t("toasts.errors.relayVerificationWriteFailed", { relayUrl }));
    } else {
      toast.error(i18n.t("toasts.errors.relayVerificationUnknownFailed", { relayUrl }));
    }
  }, [markRelayReadOutcome, markRelayWriteOutcome, pendingRelayVerificationRef, shouldShowRelayVerificationToast]);

  const notifyRelayVerificationEvent = useCallback((incoming: RelayVerificationEvent) => {
    const operation = incoming.operation === "unknown"
      ? resolveRelayVerificationOperation()
      : incoming.operation;
    const event = { ...incoming, operation };

    nostrDevLog("relay", "Relay verification event", event);

    if (event.outcome === "required") {
      pendingRelayVerificationRef.current.set(event.relayUrl.replace(/\/+$/, ""), {
        operation: event.operation,
        requestedAt: Date.now(),
      });
      return;
    }
    if (event.outcome === "failed") {
      markRelayVerificationFailure(event.relayUrl, event.operation, {
        setStatus: shouldSetVerificationFailedStatus("auth-policy", event.operation),
        showToast: false,
      });
    }
  }, [markRelayVerificationFailure, pendingRelayVerificationRef, resolveRelayVerificationOperation]);

  const probeRelayInfo = useCallback(async (relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const info = await fetchRelayInfo(normalizedRelayUrl);
    if (!info) {
      nostrDevLog("relay", "Relay NIP-11 info unavailable", {
        relayUrl: normalizedRelayUrl,
      });
      return;
    }
    relayInfoRef.current.set(normalizedRelayUrl, info);
    setRelays((previous) =>
      previous.map((relay) =>
        relay.url.replace(/\/+$/, "") === normalizedRelayUrl
          ? {
              ...relay,
              nip11: {
                authRequired: info.authRequired,
                supportsNip42: info.supportsNip42,
                checkedAt: Date.now(),
              },
            }
          : relay
      )
    );
    nostrDevLog("relay", "Relay NIP-11 info loaded", {
      relayUrl: normalizedRelayUrl,
      authRequired: info.authRequired,
      supportsNip42: info.supportsNip42,
    });
  }, [relayInfoRef, setRelays]);

  const retryNip42RelaysAfterSignIn = useCallback((relayUrlsOverride?: string[]) => {
    const relayUrlsToRetry = relayUrlsOverride
      ? relayUrlsOverride.map(normalizeRelayUrl).filter(Boolean)
      : relays
          .filter((relay) => shouldReconnectRelayAfterSignIn(relay))
          .map((relay) => normalizeRelayUrl(relay.url));

    if (relayUrlsToRetry.length === 0) return;

    nostrDevLog("relay", "Retrying failed relays after sign in", {
      relayUrls: relayUrlsToRetry,
    });

    relayUrlsToRetry.forEach((relayUrl) => {
      connectRelay(relayUrl, {
        forceNewSocket: true,
        clearCapabilityState: true,
      });
    });
  }, [connectRelay, relays]);

  return {
    beginRelayOperation,
    endRelayOperation,
    resolveRelayVerificationOperation,
    markRelayReadOutcome,
    markRelayWriteOutcome,
    shouldShowRelayVerificationToast,
    markRelayVerificationSuccess,
    markRelayVerificationFailure,
    notifyRelayVerificationEvent,
    probeRelayInfo,
    retryNip42RelaysAfterSignIn,
  };
}
