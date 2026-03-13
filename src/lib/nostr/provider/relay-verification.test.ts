import { describe, expect, it } from "vitest";
import {
  AUTH_RETRY_COOLDOWN_MS,
  isAuthRequiredCloseReason,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldRetryNip42AfterSignIn,
  shouldRetryAuthAfterReadRejection,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";

describe("isAuthRequiredCloseReason", () => {
  it("matches auth-required close reasons", () => {
    expect(isAuthRequiredCloseReason("auth-required: pubkey not in whitelist")).toBe(true);
    expect(isAuthRequiredCloseReason("blocked: not authorized")).toBe(true);
  });

  it("ignores unrelated close reasons", () => {
    expect(isAuthRequiredCloseReason("rate-limited")).toBe(false);
  });
});

describe("shouldSetVerificationFailedStatus", () => {
  it("marks auth-policy read and write failures, plus explicit subscription read rejection", () => {
    expect(shouldSetVerificationFailedStatus("subscription-closed", "read")).toBe(true);
    expect(shouldSetVerificationFailedStatus("auth-policy", "read")).toBe(true);
    expect(shouldSetVerificationFailedStatus("auth-policy", "write")).toBe(true);
    expect(shouldSetVerificationFailedStatus("auth-policy", "unknown")).toBe(false);
    expect(shouldSetVerificationFailedStatus("subscription-closed", "write")).toBe(false);
  });
});

describe("shouldMarkRelayReadOnlyAfterPublishReject", () => {
  it("marks read-only for auth-required close reasons", () => {
    expect(shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: "auth-required: pubkey not in whitelist",
    })).toBe(true);
  });

  it("marks read-only for explicit rejection reasons", () => {
    expect(shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: "publish rejected",
      rejectionReason: "permission denied",
    })).toBe(true);
  });

  it("marks read-only for NIP-01 OK false envelope failures", () => {
    expect(shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: '["OK","68dd30...",false,"blocked by policy"]',
    })).toBe(true);
  });

  it("does not mark read-only for unrelated transient failures", () => {
    expect(shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: "network timeout",
      rejectionReason: "temporary upstream timeout",
    })).toBe(false);
  });
});

describe("shouldRetryAuthAfterReadRejection", () => {
  it("retries when signer exists, no auth challenge was observed, and cooldown passed", () => {
    expect(shouldRetryAuthAfterReadRejection({
      hasSigner: true,
      hadPendingAuthChallenge: false,
      lastRetryAt: undefined,
      now: 1000,
    })).toBe(true);
  });

  it("does not retry when signed out or a challenge already exists", () => {
    expect(shouldRetryAuthAfterReadRejection({
      hasSigner: false,
      hadPendingAuthChallenge: false,
      lastRetryAt: undefined,
      now: 1000,
    })).toBe(false);
    expect(shouldRetryAuthAfterReadRejection({
      hasSigner: true,
      hadPendingAuthChallenge: true,
      lastRetryAt: undefined,
      now: 1000,
    })).toBe(false);
  });

  it("throttles retries by cooldown", () => {
    expect(shouldRetryAuthAfterReadRejection({
      hasSigner: true,
      hadPendingAuthChallenge: false,
      lastRetryAt: 1000,
      now: 1000 + AUTH_RETRY_COOLDOWN_MS - 1,
    })).toBe(false);
    expect(shouldRetryAuthAfterReadRejection({
      hasSigner: true,
      hadPendingAuthChallenge: false,
      lastRetryAt: 1000,
      now: 1000 + AUTH_RETRY_COOLDOWN_MS,
    })).toBe(true);
  });
});

describe("shouldRetryNip42AfterSignIn", () => {
  it("retries for relays that advertise NIP-42 support", () => {
    expect(shouldRetryNip42AfterSignIn({
      nip11: { supportsNip42: true },
    })).toBe(true);
    expect(shouldRetryNip42AfterSignIn({
      nip11: { supportsNip42: false },
    })).toBe(false);
    expect(shouldRetryNip42AfterSignIn({})).toBe(false);
  });

  it("also retries auth-required and previously rejected relays", () => {
    expect(shouldRetryNip42AfterSignIn({
      nip11: { authRequired: true },
    })).toBe(true);
    expect(shouldRetryNip42AfterSignIn({
      status: "verification-failed",
    })).toBe(true);
    expect(shouldRetryNip42AfterSignIn({
      status: "read-only",
    })).toBe(true);
  });
});
