import type { RelayVerificationEvent } from "../nip42-relay-auth-policy";

export type RelayVerificationFailureSource = "auth-policy" | "subscription-closed";

const AUTH_REQUIRED_CLOSE_REASON_PATTERN = /(auth-required|not authorized|pubkey not in whitelist|blocked:\s*not authorized)/i;
export const AUTH_RETRY_COOLDOWN_MS = 10000;

export function isAuthRequiredCloseReason(reason: string): boolean {
  return AUTH_REQUIRED_CLOSE_REASON_PATTERN.test(reason);
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
