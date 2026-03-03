import { describe, expect, it } from "vitest";
import { isAuthRequiredCloseReason, shouldSetVerificationFailedStatus } from "./relay-verification";

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
  it("only marks relays failed for explicit read rejection", () => {
    expect(shouldSetVerificationFailedStatus("subscription-closed", "read")).toBe(true);
    expect(shouldSetVerificationFailedStatus("auth-policy", "read")).toBe(false);
    expect(shouldSetVerificationFailedStatus("auth-policy", "write")).toBe(false);
    expect(shouldSetVerificationFailedStatus("auth-policy", "unknown")).toBe(false);
    expect(shouldSetVerificationFailedStatus("subscription-closed", "write")).toBe(false);
  });
});
