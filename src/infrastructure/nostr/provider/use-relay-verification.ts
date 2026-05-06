import { useCallback, useRef, type MutableRefObject } from "react";
import { type NDKRelay } from "@nostr-dev-kit/ndk";
import { toast } from "sonner";
import i18n from "@/lib/i18n/config";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { extractRelayRejectionReason } from "./relay-error";
import {
  AUTH_RETRY_COOLDOWN_MS,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import type { RelayVerificationEvent } from "@/infrastructure/nostr/nip42-relay-auth-policy";
import type { RelayInfoSummary } from "@/infrastructure/nostr/relay-info";
import type { AuthMethod, NDKRelayStatus } from "./contracts";

const RELAY_VERIFICATION_TOAST_DEDUPE_MS = 15000;

export type RelayOperation = "read" | "write" | "unknown";

interface UseRelayVerificationArgs {
  updateRelayEntry: (
    normalizedRelayUrl: string,
    transform: (relay: NDKRelayStatus) => NDKRelayStatus
  ) => void;
  relayInfoRef: MutableRefObject<Map<string, RelayInfoSummary>>;
  authMethodRef: MutableRefObject<AuthMethod>;
}

export function useRelayVerification({
  updateRelayEntry,
  relayInfoRef,
  authMethodRef,
}: UseRelayVerificationArgs) {
  const relayVerificationReadOpsRef = useRef(0);
  const relayVerificationWriteOpsRef = useRef(0);
  const relayVerificationToastHistoryRef = useRef<Map<string, number>>(new Map());
  const pendingRelayVerificationRef = useRef<Map<string, { operation: RelayOperation; requestedAt: number }>>(new Map());
  const relayAuthRetryHistoryRef = useRef<Map<string, number>>(new Map());
  const relayAuthPreflightHistoryRef = useRef<Map<string, number>>(new Map());
  const relaysPendingAuthSubscriptionReplayRef = useRef<Set<string>>(new Set());

  const tryRecordAuthPreflight = useCallback((normalizedRelayUrl: string): boolean => {
    const now = Date.now();
    const lastPrimedAt = relayAuthPreflightHistoryRef.current.get(normalizedRelayUrl) ?? 0;
    if ((now - lastPrimedAt) < AUTH_RETRY_COOLDOWN_MS) return false;
    relayAuthPreflightHistoryRef.current.set(normalizedRelayUrl, now);
    return true;
  }, []);

  const forgetAuthPreflight = useCallback((normalizedRelayUrl: string) => {
    relayAuthPreflightHistoryRef.current.delete(normalizedRelayUrl);
  }, []);

  const markRelayPendingSubscriptionReplay = useCallback((normalizedRelayUrl: string) => {
    relaysPendingAuthSubscriptionReplayRef.current.add(normalizedRelayUrl);
  }, []);

  const consumeRelayPendingSubscriptionReplay = useCallback((normalizedRelayUrl: string): boolean => {
    return relaysPendingAuthSubscriptionReplayRef.current.delete(normalizedRelayUrl);
  }, []);

  const clearAuthSessionState = useCallback(() => {
    relayAuthPreflightHistoryRef.current.clear();
    relaysPendingAuthSubscriptionReplayRef.current.clear();
  }, []);

  const resolveRelayVerificationOperation = useCallback((): RelayOperation => {
    const hasRead = relayVerificationReadOpsRef.current > 0;
    const hasWrite = relayVerificationWriteOpsRef.current > 0;
    if (hasRead && hasWrite) return "unknown";
    if (hasWrite) return "write";
    if (hasRead) return "read";
    return "unknown";
  }, []);

  const beginRelayOperation = useCallback((operation: Exclude<RelayOperation, "unknown">) => {
    if (operation === "read") {
      relayVerificationReadOpsRef.current += 1;
      return;
    }
    relayVerificationWriteOpsRef.current += 1;
  }, []);

  const endRelayOperation = useCallback((operation: Exclude<RelayOperation, "unknown">) => {
    if (operation === "read") {
      relayVerificationReadOpsRef.current = Math.max(0, relayVerificationReadOpsRef.current - 1);
      return;
    }
    relayVerificationWriteOpsRef.current = Math.max(0, relayVerificationWriteOpsRef.current - 1);
  }, []);

  const updateRelayCapabilityStatus = useCallback((
    relayUrl: string,
    nextStatus: "connected" | "read-only" | "verification-failed"
  ) => {
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    updateRelayEntry(normalizedRelayUrl, (relay) => {
      if (relay.status === "connection-error" || relay.status === "disconnected" || relay.status === "connecting") {
        return relay;
      }
      return relay.status === nextStatus ? relay : { ...relay, status: nextStatus };
    });
  }, [updateRelayEntry]);

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
  }, []);

  const markRelayVerificationSuccess = useCallback((relayUrl: string, operation: RelayOperation) => {
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    updateRelayCapabilityStatus(normalizedRelayUrl, "connected");
    if (!shouldShowRelayVerificationToast(relayUrl, operation, "verified")) {
      return;
    }
    if (!authMethodRef.current) {
      return;
    }
    const normalizedUrl = relayUrl.replace(/\/+$/, "");
    const info = relayInfoRef.current.get(normalizedUrl);
    if (info?.authRequired === false) {
      return;
    }
    if (operation === "read") {
      toast.success(i18n.t("composer:toasts.success.relayVerificationRead", { relayUrl }));
      return;
    }
    if (operation === "write") {
      toast.success(i18n.t("composer:toasts.success.relayVerificationWrite", { relayUrl }));
      return;
    }
    toast.success(i18n.t("composer:toasts.success.relayVerificationUnknown", { relayUrl }));
  }, [authMethodRef, relayInfoRef, shouldShowRelayVerificationToast, updateRelayCapabilityStatus]);

  const markRelayVerificationFailure = useCallback((
    relayUrl: string,
    operation: RelayOperation,
    options?: { setStatus?: boolean; showToast?: boolean }
  ) => {
    const shouldSetStatus = options?.setStatus ?? false;
    const shouldShowToast = options?.showToast ?? true;
    const normalizedRelayUrl = relayUrl.replace(/\/+$/, "");
    pendingRelayVerificationRef.current.delete(normalizedRelayUrl);
    if (shouldSetStatus) {
      if (operation === "read") {
        updateRelayCapabilityStatus(relayUrl, "verification-failed");
      } else if (operation === "write") {
        updateRelayEntry(normalizedRelayUrl, (relay) => {
          if (relay.status === "connection-error" || relay.status === "disconnected" || relay.status === "connecting") {
            return relay;
          }
          const nextStatus = relay.status === "verification-failed" ? "verification-failed" : "read-only";
          return relay.status === nextStatus ? relay : { ...relay, status: nextStatus };
        });
      }
    }
    if (!shouldShowToast || !authMethodRef.current || !shouldShowRelayVerificationToast(relayUrl, operation, "failed")) {
      return;
    }
    if (operation === "read") {
      toast.error(i18n.t("composer:toasts.errors.relayVerificationReadFailed", { relayUrl }));
    } else if (operation === "write") {
      toast.error(i18n.t("composer:toasts.errors.relayVerificationWriteFailed", { relayUrl }));
    } else {
      toast.error(i18n.t("composer:toasts.errors.relayVerificationUnknownFailed", { relayUrl }));
    }
  }, [authMethodRef, shouldShowRelayVerificationToast, updateRelayCapabilityStatus, updateRelayEntry]);

  const handleRelayPublishFailed = useCallback((relay: NDKRelay, error: Error) => {
    const normalizedRelayUrl = relay.url.replace(/\/+$/, "");
    const reason = error?.message ?? "";
    const rejectionReason = extractRelayRejectionReason(reason) ?? reason;
    if (!shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: reason,
      rejectionReason,
    })) {
      return;
    }
    markRelayVerificationFailure(normalizedRelayUrl, "write", {
      setStatus: true,
      showToast: false,
    });
    nostrDevLog("relay", "Relay write rejection observed via publish:failed", {
      relayUrl: normalizedRelayUrl,
      reason,
      rejectionReason,
    });
  }, [markRelayVerificationFailure]);

  const notifyRelayVerificationEvent = useCallback((incoming: RelayVerificationEvent) => {
    const normalizedRelayUrl = incoming.relayUrl.replace(/\/+$/, "");
    const existingPendingVerification = pendingRelayVerificationRef.current.get(normalizedRelayUrl);
    const operation = incoming.operation === "unknown"
      ? existingPendingVerification?.operation ?? resolveRelayVerificationOperation()
      : incoming.operation;
    const event = { ...incoming, operation };

    nostrDevLog("relay", "Relay verification event", event);

    if (event.outcome === "required") {
      pendingRelayVerificationRef.current.set(normalizedRelayUrl, {
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
  }, [markRelayVerificationFailure, resolveRelayVerificationOperation]);

  const clearVerificationStateOnLogout = useCallback(() => {
    pendingRelayVerificationRef.current.clear();
    relayAuthRetryHistoryRef.current.clear();
  }, []);

  return {
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
    clearVerificationStateOnLogout,
    updateRelayCapabilityStatus,
    markRelayVerificationSuccess,
    markRelayVerificationFailure,
    handleRelayPublishFailed,
    notifyRelayVerificationEvent,
    beginRelayOperation,
    endRelayOperation,
    tryRecordAuthPreflight,
    forgetAuthPreflight,
    markRelayPendingSubscriptionReplay,
    consumeRelayPendingSubscriptionReplay,
    clearAuthSessionState,
  };
}
