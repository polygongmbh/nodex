import { useCallback, useRef, type MutableRefObject } from "react";
import { type NDKRelay } from "@nostr-dev-kit/ndk";
import { toast } from "sonner";
import i18n from "@/lib/i18n/config";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { extractRelayRejectionReason } from "./relay-error";
import {
  isAuthRequiredCloseReason,
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
  relayCurrentInstanceRef: MutableRefObject<Map<string, NDKRelay>>;
  authMethodRef: MutableRefObject<AuthMethod>;
}

export function useRelayVerification({
  updateRelayEntry,
  relayInfoRef,
  relayCurrentInstanceRef,
  authMethodRef,
}: UseRelayVerificationArgs) {
  const relayOkRejectObserverRef = useRef<Map<string, { ws: WebSocket; handler: (event: MessageEvent) => void }>>(new Map());
  const relayVerificationReadOpsRef = useRef(0);
  const relayVerificationWriteOpsRef = useRef(0);
  const relayVerificationToastHistoryRef = useRef<Map<string, number>>(new Map());
  const pendingRelayVerificationRef = useRef<Map<string, { operation: RelayOperation; requestedAt: number }>>(new Map());
  const relayAuthRetryHistoryRef = useRef<Map<string, number>>(new Map());

  const detachRelayOkRejectObserver = useCallback((relayUrl: string) => {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const observer = relayOkRejectObserverRef.current.get(normalizedRelayUrl);
    if (!observer) return;
    observer.ws.removeEventListener("message", observer.handler);
    relayOkRejectObserverRef.current.delete(normalizedRelayUrl);
  }, []);

  const detachAllRelayOkRejectObservers = useCallback(() => {
    relayOkRejectObserverRef.current.forEach((observer) => {
      observer.ws.removeEventListener("message", observer.handler);
    });
    relayOkRejectObserverRef.current.clear();
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

  const attachRelayOkRejectObserver = useCallback((relay: NDKRelay) => {
    const normalizedRelayUrl = normalizeRelayUrl(relay.url);
    const connectivity = relay as unknown as { connectivity?: { ws?: WebSocket } };
    const ws = connectivity.connectivity?.ws;
    if (!ws) return;

    const existing = relayOkRejectObserverRef.current.get(normalizedRelayUrl);
    if (existing?.ws === ws) return;
    if (existing) {
      existing.ws.removeEventListener("message", existing.handler);
      relayOkRejectObserverRef.current.delete(normalizedRelayUrl);
    }

    const handler = (event: MessageEvent) => {
      if (relayCurrentInstanceRef.current.get(normalizedRelayUrl) !== relay) return;
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload)) return;
        const [command] = payload as [unknown, ...unknown[]];

        if (command === "CLOSED") {
          const closeReason = typeof payload[2] === "string" ? payload[2] : "";
          if (!isAuthRequiredCloseReason(closeReason)) return;
          markRelayVerificationFailure(normalizedRelayUrl, "read", {
            setStatus: shouldSetVerificationFailedStatus("subscription-closed", "read"),
            showToast: false,
          });
          nostrDevLog("relay", "Relay read rejection observed from websocket CLOSED response", {
            relayUrl: normalizedRelayUrl,
            reason: closeReason,
          });
          return;
        }

        if (command !== "OK") return;
        const ok = payload[2];
        const reason = payload[3];
        if (ok !== false || typeof reason !== "string") return;

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
        nostrDevLog("relay", "Relay write rejection observed from websocket OK response", {
          relayUrl: normalizedRelayUrl,
          reason,
          rejectionReason,
        });
      } catch {
        // Ignore non-JSON relay frames.
      }
    };

    ws.addEventListener("message", handler);
    relayOkRejectObserverRef.current.set(normalizedRelayUrl, {
      ws,
      handler,
    });
  }, [markRelayVerificationFailure, relayCurrentInstanceRef]);

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

  return {
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
    updateRelayCapabilityStatus,
    markRelayVerificationSuccess,
    markRelayVerificationFailure,
    attachRelayOkRejectObserver,
    detachRelayOkRejectObserver,
    detachAllRelayOkRejectObservers,
    notifyRelayVerificationEvent,
    beginRelayOperation,
    endRelayOperation,
  };
}
