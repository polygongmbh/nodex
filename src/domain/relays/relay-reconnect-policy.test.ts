import { describe, expect, it } from "vitest";
import { resolveManualRelayReconnectAction, shouldReconnectRelayOnSelection } from "./relay-reconnect-policy";

describe("shouldReconnectRelayOnSelection", () => {
  it("reconnects for any selection state that maps to a manual reconnect action", () => {
    expect(shouldReconnectRelayOnSelection("disconnected")).toBe(true);
    expect(shouldReconnectRelayOnSelection("connection-error")).toBe(true);
    expect(shouldReconnectRelayOnSelection("verification-failed")).toBe(true);
    expect(shouldReconnectRelayOnSelection("read-only")).toBe(true);

    expect(shouldReconnectRelayOnSelection("connected")).toBe(false);
    expect(shouldReconnectRelayOnSelection("connecting")).toBe(false);
  });

  it("does not reconnect when status is unavailable", () => {
    expect(shouldReconnectRelayOnSelection(undefined)).toBe(false);
  });
});

describe("resolveManualRelayReconnectAction", () => {
  it("retries auth and replays subscriptions for verification-failed relays", () => {
    expect(resolveManualRelayReconnectAction("verification-failed")).toEqual({
      reconnectTransport: false,
      retryAuth: true,
      replaySubscriptionsAfterAuth: true,
      verificationOperation: "read",
    });
  });

  it("retries auth on the current session for read-only relays", () => {
    expect(resolveManualRelayReconnectAction("read-only")).toEqual({
      reconnectTransport: false,
      retryAuth: true,
      replaySubscriptionsAfterAuth: false,
      verificationOperation: "write",
    });
  });

  it("keeps transport reconnect semantics for dead relay connections", () => {
    expect(resolveManualRelayReconnectAction("disconnected")).toEqual({
      reconnectTransport: true,
      retryAuth: false,
      replaySubscriptionsAfterAuth: false,
      verificationOperation: "unknown",
    });
    expect(resolveManualRelayReconnectAction("connection-error")).toEqual({
      reconnectTransport: true,
      retryAuth: false,
      replaySubscriptionsAfterAuth: false,
      verificationOperation: "unknown",
    });
  });

  it("does nothing extra for healthy or unavailable statuses", () => {
    expect(resolveManualRelayReconnectAction("connected")).toEqual({
      reconnectTransport: false,
      retryAuth: false,
      replaySubscriptionsAfterAuth: false,
      verificationOperation: "unknown",
    });
    expect(resolveManualRelayReconnectAction("connecting")).toEqual({
      reconnectTransport: false,
      retryAuth: false,
      replaySubscriptionsAfterAuth: false,
      verificationOperation: "unknown",
    });
    expect(resolveManualRelayReconnectAction(undefined)).toEqual({
      reconnectTransport: false,
      retryAuth: false,
      replaySubscriptionsAfterAuth: false,
      verificationOperation: "unknown",
    });
  });
});
