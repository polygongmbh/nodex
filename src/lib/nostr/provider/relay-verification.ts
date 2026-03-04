import type { RelayVerificationEvent } from "../nip42-relay-auth-policy";

export type RelayVerificationFailureSource = "auth-policy" | "subscription-closed";

const AUTH_REQUIRED_CLOSE_REASON_PATTERN = /(auth-required|not authorized|pubkey not in whitelist|blocked:\s*not authorized)/i;
const WRITE_REJECT_REASON_PATTERN = /(auth-required|not authorized|pubkey not in whitelist|blocked:\s*not authorized|write\s*denied|permission\s*denied|forbidden)/i;
const OK_REJECT_ENVELOPE_PATTERN = /\[\s*"OK"\s*,\s*"[^"]*"\s*,\s*false\s*,/i;
export const AUTH_RETRY_COOLDOWN_MS = 10000;

export function isAuthRequiredCloseReason(reason: string): boolean {
  return AUTH_REQUIRED_CLOSE_REASON_PATTERN.test(reason);
}

export function shouldMarkRelayReadOnlyAfterPublishReject(params: {
  errorMessage: string;
  rejectionReason?: string;
}): boolean {
  if (isAuthRequiredCloseReason(params.errorMessage)) return true;
  if (params.rejectionReason && WRITE_REJECT_REASON_PATTERN.test(params.rejectionReason)) return true;
  return OK_REJECT_ENVELOPE_PATTERN.test(params.errorMessage);
}

export function shouldSetVerificationFailedStatus(
  source: RelayVerificationFailureSource,
  operation: RelayVerificationEvent["operation"]
): boolean {
  return source === "subscription-closed" && operation === "read";
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

export function shouldRetryNip42AfterSignIn(relay: {
  nip11?: {
    supportsNip42?: boolean;
  };
}): boolean {
  return relay.nip11?.supportsNip42 === true;
}
