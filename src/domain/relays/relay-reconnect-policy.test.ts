import { describe, expect, it } from "vitest";
import { shouldReconnectRelayOnSelection } from "./relay-reconnect-policy";

describe("shouldReconnectRelayOnSelection", () => {
  it("reconnects only relay transport failure states on selection", () => {
    expect(shouldReconnectRelayOnSelection("disconnected")).toBe(true);
    expect(shouldReconnectRelayOnSelection("connection-error")).toBe(true);
    expect(shouldReconnectRelayOnSelection("verification-failed")).toBe(true);

    expect(shouldReconnectRelayOnSelection("connected")).toBe(false);
    expect(shouldReconnectRelayOnSelection("read-only")).toBe(false);
    expect(shouldReconnectRelayOnSelection("connecting")).toBe(false);
  });

  it("does not reconnect when status is unavailable", () => {
    expect(shouldReconnectRelayOnSelection(undefined)).toBe(false);
  });
});
