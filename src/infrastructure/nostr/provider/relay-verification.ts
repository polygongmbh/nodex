import type { RelayVerificationEvent } from "@/infrastructure/nostr/nip42-relay-auth-policy";

export type RelayVerificationFailureSource = "auth-policy" | "subscription-closed";

const AUTH_REQUIRED_CLOSE_REASON_PATTERN = /(auth[ -]?required|not authorized|pubkey not in whitelist|blocked:\s*not authorized)/i;
const WRITE_REJECT_REASON_PATTERN = /(auth[ -]?required|not authorized|pubkey not in whitelist|blocked(?::\s*not authorized|\s+by\s+policy)?|write\s*denied|write\s*rejected|permission\s*denied|forbidden|rejected)/i;
const OK_REJECT_ENVELOPE_PATTERN = /\[\s*"OK"\s*,\s*"[^"]*"\s*,\s*false\s*,/i;
const TRANSIENT_PUBLISH_FAILURE_PATTERN = /(timeout|timed out|network|disconnected|connection closed|unknown host|ns_error_unknown_host|not enough relays received)/i;
export const AUTH_RETRY_COOLDOWN_MS = 10000;

export function isAuthRequiredCloseReason(reason: string): boolean {
  return AUTH_REQUIRED_CLOSE_REASON_PATTERN.test(reason);
}

export function shouldMarkRelayReadOnlyAfterPublishReject(params: {
  errorMessage: string;
  rejectionReason?: string;
}): boolean {
  if (isAuthRequiredCloseReason(params.errorMessage)) return true;
  if (params.rejectionReason) {
    if (TRANSIENT_PUBLISH_FAILURE_PATTERN.test(params.rejectionReason)) return false;
    if (WRITE_REJECT_REASON_PATTERN.test(params.rejectionReason)) return true;
    return true;
  }
  if (TRANSIENT_PUBLISH_FAILURE_PATTERN.test(params.errorMessage)) return false;
  if (WRITE_REJECT_REASON_PATTERN.test(params.errorMessage)) return true;
  return OK_REJECT_ENVELOPE_PATTERN.test(params.errorMessage);
}

export function shouldSetVerificationFailedStatus(
  source: RelayVerificationFailureSource,
  operation: RelayVerificationEvent["operation"]
): boolean {
  if (source === "subscription-closed") {
    return operation === "read";
  }
  if (source === "auth-policy") {
    return operation === "read" || operation === "write";
  }
  return false;
}

export function shouldRetryAuthAfterReadRejection(params: {
  hasSigner: boolean;
  hadPendingAuthChallenge: boolean;
  lastRetryAt: number | undefined;
  now: number;
  cooldownMs?: number;
}): boolean {
  const cooldownMs = params.cooldownMs ?? AUTH_RETRY_COOLDOWN_MS;
  if (!params.hasSigner) return false;
  if (params.hadPendingAuthChallenge) return false;
  if (!params.lastRetryAt) return true;
  return (params.now - params.lastRetryAt) >= cooldownMs;
}

export function shouldReconnectRelayAfterSignIn(relay: {
  status?: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
  nip11?: {
    supportsNip42?: boolean;
    authRequired?: boolean;
  };
}): boolean {
  return (
    relay.status === "connection-error" ||
    relay.status === "disconnected" ||
    relay.status === "verification-failed" ||
    relay.status === "read-only"
  );
}

export function shouldReconnectRelayAfterResume(relay: {
  status?: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
}): boolean {
  return relay.status === "disconnected" || relay.status === "connection-error";
}

interface RelayReadAuthState {
  status?: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
  nip11?: {
    authRequired?: boolean;
  };
}

export function isRelayReadAuthRequired(relay: RelayReadAuthState): boolean {
  if (relay.status === "verification-failed") return true;
  return relay.nip11?.authRequired === true;
}

export function shouldForceSignInForReadAccess(params: {
  isSignedIn: boolean;
  relays: RelayReadAuthState[];
}): boolean {
  if (params.isSignedIn) return false;
  if (params.relays.length === 0) return false;
  return params.relays.every((relay) => isRelayReadAuthRequired(relay));
}
