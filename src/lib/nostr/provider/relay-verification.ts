import type { RelayVerificationEvent } from "../nip42-relay-auth-policy";

export type RelayVerificationFailureSource = "auth-policy" | "subscription-closed";

const AUTH_REQUIRED_CLOSE_REASON_PATTERN = /(auth-required|not authorized|pubkey not in whitelist|blocked:\s*not authorized)/i;

export function isAuthRequiredCloseReason(reason: string): boolean {
  return AUTH_REQUIRED_CLOSE_REASON_PATTERN.test(reason);
}

export function shouldSetVerificationFailedStatus(
  source: RelayVerificationFailureSource,
  operation: RelayVerificationEvent["operation"]
): boolean {
  return source === "subscription-closed" && operation === "read";
}
