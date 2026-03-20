import { describe, expect, it } from "vitest";
import {
  AUTH_RETRY_COOLDOWN_MS,
  isAuthRequiredCloseReason,
  isRelayReadAuthRequired,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldReconnectRelayAfterResume,
  shouldReconnectRelayAfterSignIn,
  shouldForceSignInForReadAccess,
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

  it("marks read-only for write rejected rejection reasons", () => {
    expect(shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: "publish rejected",
      rejectionReason: "write rejected",
    })).toBe(true);
  });

  it("marks read-only for blocked policy rejection reasons", () => {
    expect(shouldMarkRelayReadOnlyAfterPublishReject({
      errorMessage: "publish rejected",
      rejectionReason: "blocked by policy",
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

describe("shouldReconnectRelayAfterSignIn", () => {
  it("retries only relay failure states after sign-in", () => {
    expect(shouldReconnectRelayAfterSignIn({
      status: "verification-failed",
    })).toBe(true);
    expect(shouldReconnectRelayAfterSignIn({
      status: "read-only",
    })).toBe(true);
    expect(shouldReconnectRelayAfterSignIn({
      status: "connection-error",
    })).toBe(true);
    expect(shouldReconnectRelayAfterSignIn({
      status: "disconnected",
    })).toBe(true);
    expect(shouldReconnectRelayAfterSignIn({
      status: "connected",
      nip11: { supportsNip42: true, authRequired: true },
    })).toBe(false);
    expect(shouldReconnectRelayAfterSignIn({
      status: "connecting",
    })).toBe(false);
    expect(shouldReconnectRelayAfterSignIn({})).toBe(false);
  });
});

describe("shouldReconnectRelayAfterResume", () => {
  it("retries only transport-failed relays on resume", () => {
    expect(shouldReconnectRelayAfterResume({ status: "disconnected" })).toBe(true);
    expect(shouldReconnectRelayAfterResume({ status: "connection-error" })).toBe(true);
    expect(shouldReconnectRelayAfterResume({ status: "read-only" })).toBe(false);
    expect(shouldReconnectRelayAfterResume({ status: "verification-failed" })).toBe(false);
    expect(shouldReconnectRelayAfterResume({ status: "connected" })).toBe(false);
  });
});

describe("isRelayReadAuthRequired", () => {
  it("returns true for explicit read rejection and auth-required relay metadata", () => {
    expect(isRelayReadAuthRequired({ status: "verification-failed" })).toBe(true);
    expect(isRelayReadAuthRequired({ status: "connected", nip11: { authRequired: true } })).toBe(true);
  });

  it("returns false for relays without read-auth-required signals", () => {
    expect(isRelayReadAuthRequired({ status: "connected", nip11: { authRequired: false } })).toBe(false);
    expect(isRelayReadAuthRequired({ status: "read-only" })).toBe(false);
    expect(isRelayReadAuthRequired({ status: "disconnected" })).toBe(false);
  });
});

describe("shouldForceSignInForReadAccess", () => {
  it("forces sign-in only when signed out and every detected relay requires auth for reading", () => {
    expect(shouldForceSignInForReadAccess({
      isSignedIn: false,
      relays: [
        { status: "verification-failed" },
        { status: "connected", nip11: { authRequired: true } },
      ],
    })).toBe(true);
  });

  it("does not force sign-in when signed in, no relays, or any relay is readable anonymously", () => {
    expect(shouldForceSignInForReadAccess({
      isSignedIn: true,
      relays: [{ status: "verification-failed" }],
    })).toBe(false);
    expect(shouldForceSignInForReadAccess({
      isSignedIn: false,
      relays: [],
    })).toBe(false);
    expect(shouldForceSignInForReadAccess({
      isSignedIn: false,
      relays: [
        { status: "verification-failed" },
        { status: "connected", nip11: { authRequired: false } },
      ],
    })).toBe(false);
  });
});
